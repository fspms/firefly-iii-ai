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
        max_tokens: 50,
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
          ? "Output the category name and destination account name separated by '|'. Format: 'Category|Account'. If no suitable account exists, suggest a new account name."
          : "Just output the name of the category. Does not have to be a complete sentence. Ignore any long string of numbers or special characters.",
        subjectLanguage: "The subject is in English.",
        question: `In which category would a transaction (${type}) ${destinationTextEN} with the subject "${description}" fall into?`,
        accountInstruction: autoDestinationAccount ? "Also suggest the most appropriate destination account from the list below, or suggest a new account name if none match:" : "",
        accountsList: autoDestinationAccount ? existingAccounts.join(", ") : ""
      };
    } else { // FR (default)
      return {
        prompt: "Je veux catégoriser les transactions de mon compte bancaire.",
        instruction: autoDestinationAccount 
          ? "Donne le nom de la catégorie et le nom du compte destinataire séparés par '|'. Format: 'Catégorie|Compte'. Si aucun compte approprié n'existe, suggère un nouveau nom de compte."
          : "Donne simplement le nom de la catégorie. Pas de phrase complète. Ignore toute longue chaîne de chiffres ou de caractères spéciaux.",
        subjectLanguage: "Le sujet est en français.",
        question: `Dans quelle catégorie une transaction (${type}) ${destinationText} avec le sujet "${description}" correspond-elle ?`,
        accountInstruction: autoDestinationAccount ? "Suggère aussi le compte destinataire le plus approprié dans la liste ci-dessous, ou suggère un nouveau nom de compte si aucun ne correspond:" : "",
        accountsList: autoDestinationAccount ? existingAccounts.join(", ") : ""
      };
    }
  }

  #parseResponse(response, categories, existingAccounts, autoDestinationAccount) {
    if (!autoDestinationAccount) {
      // Mode simple : seulement la catégorie
      if (categories.indexOf(response) === -1) {
        return {
          category: null,
          suggestedCategory: response
        };
      }
      return {
        category: response
      };
    }

    // Mode avancé : catégorie et compte destinataire
    const parts = response.split('|');
    if (parts.length !== 2) {
      // Si le format n'est pas correct, traiter comme une catégorie simple
      if (categories.indexOf(response) === -1) {
        return {
          category: null,
          suggestedCategory: response,
          destinationAccount: null
        };
      }
      return {
        category: response,
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
