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
  #DEBUG;
  #TAG_FILTER;
  #TAG_CHECK_INTERVAL;
  #TAG_LIMIT;

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
    this.#DEBUG = getConfigVariable("DEBUG", "false") === "true";
    this.#TAG_FILTER = getConfigVariable("TAG_FILTER", "");
    this.#TAG_CHECK_INTERVAL = parseInt(getConfigVariable("TAG_CHECK_INTERVAL", "0"));
    this.#TAG_LIMIT = parseInt(getConfigVariable("TAG_LIMIT", "100"));
  }

  #debugLog(message, data = null) {
    if (this.#DEBUG) {
      const timestamp = new Date().toISOString();
      console.log(`[DEBUG ${timestamp}] ${message}`);
      if (data) {
        console.log(`[DEBUG ${timestamp}] Data:`, JSON.stringify(data, null, 2));
      }
    }
  }

  #hasRequiredTag(transaction) {
    // Si aucun tag n'est configuré, analyser toutes les transactions
    if (!this.#TAG_FILTER) {
      return true;
    }

    // Vérifier si la transaction a le tag requis
    const tags = transaction.tags || [];
    const hasTag = tags.some(tag => tag.name === this.#TAG_FILTER);
    
    this.#debugLog("Checking tag filter", {
      requiredTag: this.#TAG_FILTER,
      transactionTags: tags.map(tag => tag.name),
      hasRequiredTag: hasTag
    });

    return hasTag;
  }

  #startTagChecking() {
    if (this.#TAG_CHECK_INTERVAL > 0 && this.#TAG_FILTER) {
      console.log(`Starting periodic tag checking every ${this.#TAG_CHECK_INTERVAL} minutes`);
      this.#debugLog("Tag checking configuration", {
        interval: this.#TAG_CHECK_INTERVAL,
        tagFilter: this.#TAG_FILTER
      });
      
      // Vérification immédiate au démarrage
      this.#checkAndProcessTaggedTransactions();
      
      // Puis vérification périodique
      setInterval(() => {
        this.#checkAndProcessTaggedTransactions();
      }, this.#TAG_CHECK_INTERVAL * 60 * 1000); // Convertir minutes en millisecondes
    } else if (this.#TAG_CHECK_INTERVAL > 0 && !this.#TAG_FILTER) {
      console.warn("TAG_CHECK_INTERVAL is set but TAG_FILTER is not configured. Tag checking disabled.");
    } else {
      this.#debugLog("Tag checking disabled", {
        interval: this.#TAG_CHECK_INTERVAL,
        tagFilter: this.#TAG_FILTER
      });
    }
  }

  async #checkAndProcessTaggedTransactions() {
    try {
      this.#debugLog("Starting periodic tag check");
      
      // Récupérer les transactions avec le tag requis
      const transactions = await this.#firefly.getTransactionsWithTag(this.#TAG_FILTER, this.#TAG_LIMIT);
      
      if (transactions.length === 0) {
        this.#debugLog("No tagged transactions found during periodic check");
        return;
      }

      console.log(`[Periodic Check] ${transactions.length} transactions trouvées avec le tag "${this.#TAG_FILTER}"`);

      // Traiter chaque transaction
      for (const transaction of transactions) {
        await this.#processSingleTransaction(transaction);
      }

      console.log(`[Periodic Check] Traitement terminé pour ${transactions.length} transactions`);
      
    } catch (error) {
      console.error("[Periodic Check] Erreur lors de la vérification des tags:", error);
      this.#debugLog("Periodic tag check error", {
        error: error.message,
        stack: error.stack
      });
    }
  }

  async run() {
    this.#debugLog("Starting application initialization");
    this.#firefly = new FireflyService();
    
    // Initialiser le service IA selon la configuration
    if (this.#PROVIDER === "ollama") {
      this.#aiService = new OllamaService(
        getConfigVariable("OLLAMA_BASE_URL", "http://localhost:11434"),
        getConfigVariable("OLLAMA_MODEL", "llama3.2"),
        this.#LANGUAGE
      );
      console.log(`Using Ollama with model: ${getConfigVariable("OLLAMA_MODEL", "llama3.2")}`);
      this.#debugLog("Ollama service initialized", {
        baseUrl: getConfigVariable("OLLAMA_BASE_URL", "http://localhost:11434"),
        model: getConfigVariable("OLLAMA_MODEL", "llama3.2"),
        language: this.#LANGUAGE
      });
    } else {
      this.#aiService = new OpenAiService(
        getConfigVariable("OPENAI_API_KEY"),
        getConfigVariable("OPENAI_MODEL", "gpt-3.5-turbo"),
        this.#LANGUAGE
      );
      console.log(`Using OpenAI with model: ${getConfigVariable("OPENAI_MODEL", "gpt-3.5-turbo")}`);
      this.#debugLog("OpenAI service initialized", {
        model: getConfigVariable("OPENAI_MODEL", "gpt-3.5-turbo"),
        language: this.#LANGUAGE
      });
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
    this.#express.post("/process-existing", this.#onProcessExisting.bind(this));

    this.#server.listen(this.#PORT, async () => {
      console.log(`Application running on port ${this.#PORT}`);
      
      // Configuration automatique du webhook
      await this.#setupWebhook();
      
      // Démarrer la vérification périodique des tags si configurée
      this.#startTagChecking();
    });

    this.#io.on("connection", (socket) => {
      console.log("connected");
      socket.emit("jobs", Array.from(this.#jobList.getJobs().values()));
    });
  }

  #onWebhook(req, res) {
    try {
      console.info("Webhook triggered");
      this.#debugLog("Webhook received", {
        body: req.body,
        headers: req.headers,
        method: req.method,
        url: req.url
      });
      this.#handleWebhook(req, res);
      res.send("Queued");
    } catch (e) {
      console.error(e);
      this.#debugLog("Webhook error", {
        error: e.message,
        stack: e.stack,
        body: req.body
      });
      res.status(400).send(e.message);
    }
  }

  #onProcessExisting(req, res) {
    try {
      console.info("Processing existing transactions");
      this.#debugLog("Process existing request received", {
        body: req.body,
        headers: req.headers,
        method: req.method,
        url: req.url
      });
      
      if (!this.#TAG_FILTER) {
        res.status(400).send("TAG_FILTER must be configured to process existing transactions");
        return;
      }

      this.#processExistingTransactions(req, res);
      res.send("Processing existing transactions queued");
    } catch (e) {
      console.error(e);
      this.#debugLog("Process existing error", {
        error: e.message,
        stack: e.stack,
        body: req.body
      });
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

    const transaction = req.body.content.transactions[0];
    const destinationName = transaction.destination_name;
    const description = transaction.description;
    const type = transaction.type;

    // Si le destination_name est "(unknown destination account)", on ne l'utilise pas
    const hasValidDestination = destinationName && destinationName !== "(unknown destination account)";
    const effectiveDestinationName = hasValidDestination ? destinationName : null;

    this.#debugLog("Processing transaction", {
      destinationName,
      effectiveDestinationName,
      hasValidDestination,
      description,
      type,
      transactionId: req.body.content.id,
      fullTransaction: transaction
    });

    const job = this.#jobList.createJob({
      destinationName,
      description,
    });

    this.#queue.push(async () => {
      try {
        this.#jobList.setJobInProgress(job.id);

        this.#debugLog("Fetching categories and accounts");
        const categories = await this.#firefly.getCategories();
        this.#debugLog("Categories retrieved", {
          count: categories.size,
          categories: Array.from(categories.keys())
        });
        
        let destinationAccounts = new Map();
        if (this.#AUTO_DESTINATION_ACCOUNT) {
          destinationAccounts = await this.#firefly.getDestinationAccounts();
          this.#debugLog("Destination accounts retrieved", {
            count: destinationAccounts.size,
            accounts: Array.from(destinationAccounts.keys())
          });
        }

        this.#debugLog("Starting AI classification", {
          categories: Array.from(categories.keys()),
          destinationAccounts: Array.from(destinationAccounts.keys()),
          autoDestinationAccount: this.#AUTO_DESTINATION_ACCOUNT
        });

        const classificationResult = await this.#aiService.classify(
          Array.from(categories.keys()),
          effectiveDestinationName,
          description,
          type,
          Array.from(destinationAccounts.keys()),
          this.#AUTO_DESTINATION_ACCOUNT
        );

        this.#debugLog("AI classification completed", classificationResult);

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
          this.#debugLog("Using existing category", {
            category: classificationResult.category,
            categoryId: categoryId
          });
        } else if (classificationResult?.suggestedCategory) {
          // Aucune catégorie existante, créer une nouvelle catégorie
          console.log(`Création d'une nouvelle catégorie: ${classificationResult.suggestedCategory}`);
          this.#debugLog("Creating new category", {
            suggestedCategory: classificationResult.suggestedCategory
          });
          categoryId = await this.#firefly.createCategory(classificationResult.suggestedCategory);
          newData.category = classificationResult.suggestedCategory;
          this.#debugLog("New category created", {
            category: classificationResult.suggestedCategory,
            categoryId: categoryId
          });
        } else {
          console.warn(`Aucune catégorie trouvée pour la transaction: ${destinationName} - ${description}`);
          this.#debugLog("No category found for transaction");
        }

        // Gestion des comptes destinataires
        let destinationAccountId = null;
        if (this.#AUTO_DESTINATION_ACCOUNT) {
          if (classificationResult?.destinationAccount) {
            // Compte destinataire existant trouvé
            destinationAccountId = destinationAccounts.get(classificationResult.destinationAccount);
            this.#debugLog("Using existing destination account", {
              account: classificationResult.destinationAccount,
              accountId: destinationAccountId
            });
          } else if (classificationResult?.suggestedDestinationAccount && this.#CREATE_DESTINATION_ACCOUNTS) {
            // Aucun compte destinataire existant, créer un nouveau compte
            console.log(`Création d'un nouveau compte destinataire: ${classificationResult.suggestedDestinationAccount}`);
            this.#debugLog("Creating new destination account", {
              suggestedAccount: classificationResult.suggestedDestinationAccount
            });
            destinationAccountId = await this.#firefly.createDestinationAccount(classificationResult.suggestedDestinationAccount);
            newData.destinationAccount = classificationResult.suggestedDestinationAccount;
            this.#debugLog("New destination account created", {
              account: classificationResult.suggestedDestinationAccount,
              accountId: destinationAccountId
            });
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
      this.#debugLog("Starting webhook setup");
      const webhookUrl = getConfigVariable("WEBHOOK_URL");
      
      if (!webhookUrl) {
        console.warn("WEBHOOK_URL non configuré. Configuration manuelle requise.");
        console.log("Pour configurer automatiquement le webhook, ajoutez la variable d'environnement WEBHOOK_URL");
        console.log("Exemple: WEBHOOK_URL=https://votre-domaine.com/webhook");
        this.#debugLog("Webhook setup skipped - no WEBHOOK_URL configured");
        return;
      }

      this.#debugLog("Checking for existing webhooks", { webhookUrl });
      console.log("Vérification des webhooks existants...");
      const existingWebhook = await this.#firefly.checkExistingWebhook(webhookUrl);
      
      if (existingWebhook) {
        console.log("Webhook déjà configuré:", existingWebhook.attributes.title);
        this.#debugLog("Existing webhook found", {
          id: existingWebhook.id,
          title: existingWebhook.attributes.title,
          url: existingWebhook.attributes.url,
          active: existingWebhook.attributes.active
        });
        return;
      }

      this.#debugLog("Creating new webhook", { webhookUrl });
      console.log("Création automatique du webhook...");
      const webhook = await this.#firefly.createWebhook(webhookUrl);
      console.log("Webhook créé avec succès!");
      console.log(`   - ID: ${webhook.id}`);
      console.log(`   - URL: ${webhook.attributes.url}`);
      console.log(`   - Statut: ${webhook.attributes.active ? 'Actif' : 'Inactif'}`);
      
      this.#debugLog("Webhook created successfully", {
        id: webhook.id,
        url: webhook.attributes.url,
        active: webhook.attributes.active,
        title: webhook.attributes.title
      });
      
    } catch (error) {
      console.error("Erreur lors de la configuration du webhook:", error.message);
      console.log("Configuration manuelle requise. Consultez le README pour les instructions.");
      this.#debugLog("Webhook setup error", {
        error: error.message,
        stack: error.stack
      });
    }
  }

  async #processExistingTransactions(req, res) {
    try {
      this.#debugLog("Starting to process existing transactions", { tagFilter: this.#TAG_FILTER });
      
      // Récupérer les transactions avec le tag requis
      const transactions = await this.#firefly.getTransactionsWithTag(this.#TAG_FILTER, this.#TAG_LIMIT);
      
      if (transactions.length === 0) {
        console.log(`Aucune transaction trouvée avec le tag "${this.#TAG_FILTER}"`);
        return;
      }

      console.log(`${transactions.length} transactions trouvées avec le tag "${this.#TAG_FILTER}"`);

      // Traiter chaque transaction
      for (const transaction of transactions) {
        await this.#processSingleTransaction(transaction);
      }

      console.log(`Traitement terminé pour ${transactions.length} transactions`);
      
    } catch (error) {
      console.error("Erreur lors du traitement des transactions existantes:", error);
      this.#debugLog("Process existing transactions error", {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async #processSingleTransaction(transaction) {
    try {
      const destinationName = transaction.attributes.transactions[0].destination_name;
      const description = transaction.attributes.transactions[0].description;
      const type = transaction.attributes.transactions[0].type;

      this.#debugLog("Processing single transaction", {
        transactionId: transaction.id,
        destinationName,
        description,
        type
      });

      // Si le destination_name est "(unknown destination account)", on ne l'utilise pas
      const hasValidDestination = destinationName && destinationName !== "(unknown destination account)";
      const effectiveDestinationName = hasValidDestination ? destinationName : null;

      // Récupérer les catégories et comptes
      const categories = await this.#firefly.getCategories();
      
      let destinationAccounts = new Map();
      if (this.#AUTO_DESTINATION_ACCOUNT) {
        destinationAccounts = await this.#firefly.getDestinationAccounts();
      }

      // Classification IA
      const classificationResult = await this.#aiService.classify(
        Array.from(categories.keys()),
        effectiveDestinationName,
        description,
        type,
        Array.from(destinationAccounts.keys()),
        this.#AUTO_DESTINATION_ACCOUNT
      );

      this.#debugLog("AI classification completed for existing transaction", classificationResult);

      // Gestion des catégories
      let categoryId = null;
      if (classificationResult?.category) {
        categoryId = categories.get(classificationResult.category);
        this.#debugLog("Using existing category", {
          category: classificationResult.category,
          categoryId: categoryId
        });
      } else if (classificationResult?.suggestedCategory) {
        console.log(`Création d'une nouvelle catégorie: ${classificationResult.suggestedCategory}`);
        this.#debugLog("Creating new category", {
          suggestedCategory: classificationResult.suggestedCategory
        });
        categoryId = await this.#firefly.createCategory(classificationResult.suggestedCategory);
        this.#debugLog("New category created", {
          category: classificationResult.suggestedCategory,
          categoryId: categoryId
        });
      }

      // Gestion des comptes destinataires
      let destinationAccountId = null;
      if (this.#AUTO_DESTINATION_ACCOUNT) {
        if (classificationResult?.destinationAccount) {
          destinationAccountId = destinationAccounts.get(classificationResult.destinationAccount);
          this.#debugLog("Using existing destination account", {
            account: classificationResult.destinationAccount,
            accountId: destinationAccountId
          });
        } else if (classificationResult?.suggestedDestinationAccount && this.#CREATE_DESTINATION_ACCOUNTS) {
          console.log(`Création d'un nouveau compte destinataire: ${classificationResult.suggestedDestinationAccount}`);
          this.#debugLog("Creating new destination account", {
            suggestedAccount: classificationResult.suggestedDestinationAccount
          });
          destinationAccountId = await this.#firefly.createDestinationAccount(classificationResult.suggestedDestinationAccount);
          this.#debugLog("New destination account created", {
            account: classificationResult.suggestedDestinationAccount,
            accountId: destinationAccountId
          });
        }
      }

      // Appliquer les modifications à la transaction
      if (categoryId || destinationAccountId) {
        await this.#firefly.setCategoryAndDestination(
          transaction.id,
          transaction.attributes.transactions,
          categoryId,
          destinationAccountId
        );
        console.log(`Transaction ${transaction.id} mise à jour avec succès`);
      }

      // Supprimer le tag après traitement pour éviter les boucles
      if (this.#TAG_FILTER) {
        try {
          await this.#firefly.removeTagFromTransaction(transaction.id, this.#TAG_FILTER);
          this.#debugLog("Tag removed after processing", { 
            transactionId: transaction.id, 
            tagName: this.#TAG_FILTER 
          });
        } catch (error) {
          console.error(`Erreur lors de la suppression du tag de la transaction ${transaction.id}:`, error);
          this.#debugLog("Tag removal error", {
            transactionId: transaction.id,
            tagName: this.#TAG_FILTER,
            error: error.message
          });
        }
      }

    } catch (error) {
      console.error(`Erreur lors du traitement de la transaction ${transaction.id}:`, error);
      this.#debugLog("Single transaction processing error", {
        transactionId: transaction.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

class WebhookException extends Error {
  constructor(message) {
    super(message);
  }
}
