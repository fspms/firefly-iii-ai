import express from "express";
import { getConfigVariable } from "./util.js";
import FireflyService from "./FireflyService.js";
import OpenAiService from "./OpenAiService.js";
import OllamaService from "./OllamaService.js";
import { Server } from "socket.io";
import * as http from "http";
import Queue from "queue";
import JobList from "./JobList.js";

export default class App {
  #PORT;
  #ENABLE_UI;
  #LANGUAGE;
  #PROVIDER;
  #AUTO_DESTINATION_ACCOUNT;
  #CREATE_DESTINATION_ACCOUNTS;

  #firefly;
  #aiService;

  #server;
  #io;
  #express;

  #queue;
  #jobList;

  constructor() {
    this.#PORT = getConfigVariable("PORT", "3000");
    this.#ENABLE_UI = getConfigVariable("ENABLE_UI", "false") === "true";
    this.#LANGUAGE = getConfigVariable("LANGUAGE", "FR"); // FR pour français, EN pour anglais
    this.#PROVIDER = getConfigVariable("PROVIDER", "openai"); // openai ou ollama
    this.#AUTO_DESTINATION_ACCOUNT = getConfigVariable("AUTO_DESTINATION_ACCOUNT", "false") === "true";
    this.#CREATE_DESTINATION_ACCOUNTS = getConfigVariable("CREATE_DESTINATION_ACCOUNTS", "false") === "true";
  }

  async run() {
    this.#firefly = new FireflyService();
    
    // Initialiser le service IA selon la configuration
    if (this.#PROVIDER === "ollama") {
      this.#aiService = new OllamaService(
        getConfigVariable("OLLAMA_BASE_URL", "http://localhost:11434"),
        getConfigVariable("OLLAMA_MODEL", "llama3.2"),
        this.#LANGUAGE
      );
      console.log(`Using Ollama with model: ${getConfigVariable("OLLAMA_MODEL", "llama3.2")}`);
    } else {
      this.#aiService = new OpenAiService(
        getConfigVariable("OPENAI_API_KEY"),
        getConfigVariable("OPENAI_MODEL", "gpt-3.5-turbo"),
        this.#LANGUAGE
      );
      console.log(`Using OpenAI with model: ${getConfigVariable("OPENAI_MODEL", "gpt-3.5-turbo")}`);
    }

    this.#queue = new Queue({
      timeout: 30 * 1000,
      concurrency: 1,
      autostart: true,
    });

    this.#queue.addEventListener("start", (job) =>
      console.log("Job started", job)
    );
    this.#queue.addEventListener("success", (event) =>
      console.log("Job success", event.job)
    );
    this.#queue.addEventListener("error", (event) => {
      console.error("Job error:", event.job || "No job info", event.err || "No error details", event);
      if (event.err) {
        console.error("Error details:", event.err.message || event.err);
        console.error("Error stack:", event.err.stack);
      }
    });
    this.#queue.addEventListener("timeout", (event) =>
      console.log("Job timeout", event.job)
    );

    this.#express = express();
    this.#server = http.createServer(this.#express);
    this.#io = new Server(this.#server);

    this.#jobList = new JobList();
    this.#jobList.on("job created", (data) =>
      this.#io.emit("job created", data)
    );
    this.#jobList.on("job updated", (data) =>
      this.#io.emit("job updated", data)
    );

    this.#express.use(express.json());

    if (this.#ENABLE_UI) {
      this.#express.use("/", express.static("public"));
    }

    this.#express.post("/webhook", this.#onWebhook.bind(this));

    this.#server.listen(this.#PORT, async () => {
      console.log(`Application running on port ${this.#PORT}`);
      
      // Configuration automatique du webhook
      await this.#setupWebhook();
    });

    this.#io.on("connection", (socket) => {
      console.log("connected");
      socket.emit("jobs", Array.from(this.#jobList.getJobs().values()));
    });
  }

  #onWebhook(req, res) {
    try {
      console.info("Webhook triggered");
      this.#handleWebhook(req, res);
      res.send("Queued");
    } catch (e) {
      console.error(e);
      res.status(400).send(e.message);
    }
  }

  #handleWebhook(req, res) {
    // TODO: validate auth

    if (req.body?.trigger !== "STORE_TRANSACTION") {
      throw new WebhookException(
        "trigger is not STORE_TRANSACTION. Request will not be processed"
      );
    }

    if (req.body?.response !== "TRANSACTIONS") {
      throw new WebhookException(
        "trigger is not TRANSACTION. Request will not be processed"
      );
    }

    if (!req.body?.content?.id) {
      throw new WebhookException("Missing content.id");
    }

    if (req.body?.content?.transactions?.length === 0) {
      throw new WebhookException(
        "No transactions are available in content.transactions"
      );
    }

    if (
      req.body.content.transactions[0].type !== "withdrawal" &&
      req.body.content.transactions[0].type !== "deposit"
    ) {
      throw new WebhookException(
        "content.transactions[0].type has to be 'withdrawal' or 'deposit'. Transaction will be ignored."
      );
    }

    // if (req.body.content.transactions[0].category_id !== null) {
    //   throw new WebhookException(
    //     "content.transactions[0].category_id is already set. Transaction will be ignored."
    //   );
    // }

    if (!req.body.content.transactions[0].description) {
      throw new WebhookException("Missing content.transactions[0].description");
    }

    if (!req.body.content.transactions[0].destination_name) {
      throw new WebhookException(
        "Missing content.transactions[0].destination_name"
      );
    }

    const destinationName = req.body.content.transactions[0].destination_name;
    const description = req.body.content.transactions[0].description;
    const type = req.body.content.transactions[0].type;

    const job = this.#jobList.createJob({
      destinationName,
      description,
    });

    this.#queue.push(async () => {
      try {
        this.#jobList.setJobInProgress(job.id);

        const categories = await this.#firefly.getCategories();
        
        let destinationAccounts = new Map();
        if (this.#AUTO_DESTINATION_ACCOUNT) {
          destinationAccounts = await this.#firefly.getDestinationAccounts();
        }

        const classificationResult = await this.#aiService.classify(
          Array.from(categories.keys()),
          destinationName,
          description,
          type,
          Array.from(destinationAccounts.keys()),
          this.#AUTO_DESTINATION_ACCOUNT
        );

        const newData = Object.assign({}, job.data);
        newData.category = classificationResult?.category || null;
        newData.prompt = classificationResult?.prompt || null;
        newData.response = classificationResult?.response || null;
        newData.destinationAccount = classificationResult?.destinationAccount || null;
        newData.suggestedDestinationAccount = classificationResult?.suggestedDestinationAccount || null;

        this.#jobList.updateJobData(job.id, newData);

        // Gestion des catégories
        let categoryId = null;
        if (classificationResult?.category) {
          // Catégorie existante trouvée
          categoryId = categories.get(classificationResult.category);
        } else if (classificationResult?.suggestedCategory) {
          // Aucune catégorie existante, créer une nouvelle catégorie
          console.log(`Création d'une nouvelle catégorie: ${classificationResult.suggestedCategory}`);
          categoryId = await this.#firefly.createCategory(classificationResult.suggestedCategory);
          newData.category = classificationResult.suggestedCategory;
        } else {
          console.warn(`Aucune catégorie trouvée pour la transaction: ${destinationName} - ${description}`);
        }

        // Gestion des comptes destinataires
        let destinationAccountId = null;
        if (this.#AUTO_DESTINATION_ACCOUNT) {
          if (classificationResult?.destinationAccount) {
            // Compte destinataire existant trouvé
            destinationAccountId = destinationAccounts.get(classificationResult.destinationAccount);
          } else if (classificationResult?.suggestedDestinationAccount && this.#CREATE_DESTINATION_ACCOUNTS) {
            // Aucun compte destinataire existant, créer un nouveau compte
            console.log(`Création d'un nouveau compte destinataire: ${classificationResult.suggestedDestinationAccount}`);
            destinationAccountId = await this.#firefly.createDestinationAccount(classificationResult.suggestedDestinationAccount);
            newData.destinationAccount = classificationResult.suggestedDestinationAccount;
          }
        }

        // Appliquer les modifications à la transaction
        if (categoryId || destinationAccountId) {
          await this.#firefly.setCategoryAndDestination(
            req.body.content.id,
            req.body.content.transactions,
            categoryId,
            destinationAccountId
          );
        }

        // Mettre à jour les données du job
        this.#jobList.updateJobData(job.id, newData);

        this.#jobList.setJobFinished(job.id);
      } catch (error) {
        console.error("Erreur lors du traitement de la transaction:", error);
        this.#jobList.setJobError(job.id, error.message);
        throw error; // Re-throw pour que la queue puisse le capturer
      }
    });
  }

  async #setupWebhook() {
    try {
      const webhookUrl = getConfigVariable("WEBHOOK_URL");
      
      if (!webhookUrl) {
        console.warn("WEBHOOK_URL non configuré. Configuration manuelle requise.");
        console.log("Pour configurer automatiquement le webhook, ajoutez la variable d'environnement WEBHOOK_URL");
        console.log("Exemple: WEBHOOK_URL=https://votre-domaine.com/webhook");
        return;
      }

      console.log("Vérification des webhooks existants...");
      const existingWebhook = await this.#firefly.checkExistingWebhook(webhookUrl);
      
      if (existingWebhook) {
        console.log("Webhook déjà configuré:", existingWebhook.attributes.title);
        return;
      }

      console.log("Création automatique du webhook...");
      const webhook = await this.#firefly.createWebhook(webhookUrl);
      console.log("Webhook créé avec succès!");
      console.log(`   - ID: ${webhook.id}`);
      console.log(`   - URL: ${webhook.attributes.url}`);
      console.log(`   - Statut: ${webhook.attributes.active ? 'Actif' : 'Inactif'}`);
      
    } catch (error) {
      console.error("Erreur lors de la configuration du webhook:", error.message);
      console.log("Configuration manuelle requise. Consultez le README pour les instructions.");
    }
  }
}

class WebhookException extends Error {
  constructor(message) {
    super(message);
  }
}
