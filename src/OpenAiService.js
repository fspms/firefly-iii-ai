import { Configuration, OpenAIApi } from "openai";
import { getConfigVariable } from "./util.js";

export default class OpenAiService {
  #openAi;
  #model = "gpt-3.5-turbo-instruct"; // Using the instruct model
  #language;
  #DEBUG;

  constructor(apiKey, model = "gpt-3.5-turbo-instruct", language = "FR") {
    this.#model = model;
    this.#language = language;
    this.#DEBUG = getConfigVariable("DEBUG", "false") === "true";

    const configuration = new Configuration({
      apiKey,
    });

    this.#openAi = new OpenAIApi(configuration);
  }

  #debugLog(message, data = null) {
    if (this.#DEBUG) {
      const timestamp = new Date().toISOString();
      console.log(`[DEBUG OpenAiService ${timestamp}] ${message}`);
      if (data) {
        console.log(`[DEBUG OpenAiService ${timestamp}] Data:`, JSON.stringify(data, null, 2));
      }
    }
  }

  async classify(categories, destinationName, description, type, existingAccounts = [], autoDestinationAccount = false) {
    try {
      this.#debugLog("Starting AI classification", {
        destinationName,
        description,
        type,
        categoriesCount: categories.length,
        existingAccountsCount: existingAccounts.length,
        autoDestinationAccount
      });

      const prompt = this.#generatePrompt(
        categories,
        destinationName,
        description,
        type,
        existingAccounts,
        autoDestinationAccount
      );

      this.#debugLog("Generated prompt", { prompt });

      const response = await this.#openAi.createChatCompletion({
        model: this.#model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 100,
      });

      let guess = response.data.choices[0].message.content;
      guess = guess.replace("\n", "");
      guess = guess.trim();

      this.#debugLog("AI response received", { guess });

      // Parse the response to extract category and destination account
      const result = this.#parseResponse(guess, categories, existingAccounts, autoDestinationAccount);

      this.#debugLog("Parsed result", result);

      return {
        prompt,
        response: response.data.choices[0].message.content,
        ...result
      };
    } catch (error) {
      this.#debugLog("OpenAI error", {
        error: error.message,
        stack: error.stack,
        response: error.response?.data
      });
      
      if (error.response) {
        console.error(error.response.status);
        console.error(error.response.data);
        throw new OpenAiException(
          error.status,
          error.response,
          error.response.data
        );
      } else {
        console.error(error.message);
        throw new OpenAiException(null, null, error.message);
      }
    }
  }

  #generatePrompt(categories, destinationName, description, type, existingAccounts = [], autoDestinationAccount = false) {
    const languageConfig = this.#getLanguageConfig(destinationName, description, type, existingAccounts, autoDestinationAccount);
    
    let prompt = `
${languageConfig.prompt}
${languageConfig.instruction}
${languageConfig.subjectLanguage}
${languageConfig.question}
The categories are: 

${categories.join(", ")}
`;

    if (autoDestinationAccount && existingAccounts.length > 0) {
      prompt += `

${languageConfig.accountInstruction}
${languageConfig.accountsList}
`;
    }

    return prompt;
  }

  #getLanguageConfig(destinationName, description, type, existingAccounts = [], autoDestinationAccount = false) {
    // Gérer le cas où destinationName est null ou "(unknown destination account)"
    const hasValidDestination = destinationName && destinationName !== "(unknown destination account)";
    const destinationText = hasValidDestination ? `de "${destinationName}"` : "";
    const destinationTextEN = hasValidDestination ? `from "${destinationName}"` : "";
    
    if (this.#language === "EN") {
      return {
        prompt: "I want to categorize transactions on my bank account.",
        instruction: autoDestinationAccount 
          ? "Respond ONLY in the format 'Category|Account' (e.g., 'Food|Intermarché'). For the account name, use only the company/merchant/entity name (e.g., 'Amazon', 'Generali', 'McDonald's'), not the category + company name."
          : "Just output the name of the category. Does not have to be a complete sentence. Ignore any long string of numbers or special characters.",
        subjectLanguage: "The subject is in English.",
        question: `In which category would a transaction (${type}) ${destinationTextEN} with the subject "${description}" fall into?`,
        accountInstruction: autoDestinationAccount ? "Also suggest the most appropriate destination account from the list below, or suggest a new account name if none match. Use only the company/merchant name:" : "",
        accountsList: autoDestinationAccount ? existingAccounts.join(", ") : ""
      };
    } else { // FR (default)
      return {
        prompt: "Je veux catégoriser les transactions de mon compte bancaire.",
        instruction: autoDestinationAccount 
          ? "Réponds UNIQUEMENT au format 'Catégorie|Compte' (ex: 'Alimentation|Intermarché'). Pour le nom du compte, utilise seulement le nom de l'entreprise/merchant/entité (ex: 'Amazon', 'Generali', 'McDonald's'), pas la catégorie + nom d'entreprise."
          : "Donne simplement le nom de la catégorie. Pas de phrase complète. Ignore toute longue chaîne de chiffres ou de caractères spéciaux.",
        subjectLanguage: "Le sujet est en français.",
        question: `Dans quelle catégorie une transaction (${type}) ${destinationText} avec le sujet "${description}" correspond-elle ?`,
        accountInstruction: autoDestinationAccount ? "Suggère aussi le compte destinataire le plus approprié dans la liste ci-dessous, ou suggère un nouveau nom de compte si aucun ne correspond. Utilise seulement le nom de l'entreprise/merchant:" : "",
        accountsList: autoDestinationAccount ? existingAccounts.join(", ") : ""
      };
    }
  }

  #parseResponse(response, categories, existingAccounts, autoDestinationAccount) {
    // Nettoyer la réponse des phrases complètes
    let cleanResponse = response;
    
    // Si la réponse contient des phrases complètes, essayer d'extraire le format attendu
    if (response.includes('correspond à la catégorie') || response.includes('correspond to the category')) {
      // Chercher le pattern "catégorie" et "compte"
      const categoryMatch = response.match(/catégorie[^"]*"([^"]+)"/i) || response.match(/category[^"]*"([^"]+)"/i);
      const accountMatch = response.match(/compte[^"]*"([^"]+)"/i) || response.match(/account[^"]*"([^"]+)"/i);
      
      if (categoryMatch && accountMatch) {
        cleanResponse = `${categoryMatch[1]}|${accountMatch[1]}`;
      } else if (categoryMatch) {
        cleanResponse = categoryMatch[1];
      }
    }
    
    // Si la réponse est tronquée et contient "|", essayer de la compléter
    if (cleanResponse.includes('|') && !cleanResponse.endsWith('|') && cleanResponse.split('|').length === 1) {
      // La réponse semble tronquée, traiter comme une catégorie simple
      cleanResponse = cleanResponse.split('|')[0];
    }

    this.#debugLog("Cleaned response", { original: response, cleaned: cleanResponse });

    if (!autoDestinationAccount) {
      // Mode simple : seulement la catégorie
      if (categories.indexOf(cleanResponse) === -1) {
        return {
          category: null,
          suggestedCategory: cleanResponse
        };
      }
      return {
        category: cleanResponse
      };
    }

    // Mode avancé : catégorie et compte destinataire
    const parts = cleanResponse.split('|');
    if (parts.length !== 2) {
      // Si le format n'est pas correct, traiter comme une catégorie simple
      if (categories.indexOf(cleanResponse) === -1) {
        return {
          category: null,
          suggestedCategory: cleanResponse,
          destinationAccount: null
        };
      }
      return {
        category: cleanResponse,
        destinationAccount: null
      };
    }

    const [category, account] = parts.map(part => part.trim());
    
    const result = {
      category: categories.indexOf(category) !== -1 ? category : null,
      suggestedCategory: categories.indexOf(category) === -1 ? category : null,
      destinationAccount: existingAccounts.indexOf(account) !== -1 ? account : null,
      suggestedDestinationAccount: existingAccounts.indexOf(account) === -1 ? account : null
    };

    return result;
  }
}

class OpenAiException extends Error {
  code;
  response;
  body;

  constructor(statusCode, response, body) {
    super(`Error while communicating with OpenAI: ${statusCode} - ${body}`);

    this.code = statusCode;
    this.response = response;
    this.body = body;
  }
}
