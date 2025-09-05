import OpenAI from "openai";
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

    this.#openAi = new OpenAI({
      apiKey,
    });
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

      const response = await this.#openAi.chat.completions.create({
        model: this.#model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 150,
      });

      let guess = response.choices[0].message.content;
      guess = guess.replace("\n", "");
      guess = guess.trim();

      this.#debugLog("AI response received", { guess });

      // Parse the response to extract category and destination account
      const result = this.#parseResponse(guess, categories, existingAccounts, autoDestinationAccount);

      this.#debugLog("Parsed result", result);

      return {
        prompt,
        response: response.choices[0].message.content,
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
          ? "Respond ONLY in the following JSON format:\n{\n  \"category\": \"Category name\",\n  \"destinationAccount\": \"Account name\"\n}\nFor the account name, use only the company/merchant/entity name (e.g., 'Amazon', 'Generali', 'McDonald's'), not the category + company name."
          : "Respond ONLY in the following JSON format:\n{\n  \"category\": \"Category name\"\n}\nJust output the name of the category. Does not have to be a complete sentence. Ignore any long string of numbers or special characters.",
        subjectLanguage: "The subject is in English.",
        question: `In which category would a transaction (${type}) ${destinationTextEN} with the subject "${description}" fall into?`,
        accountInstruction: autoDestinationAccount ? "Also suggest the most appropriate destination account from the list below, or suggest a new account name if none match. Use only the company/merchant name:" : "",
        accountsList: autoDestinationAccount ? existingAccounts.join(", ") : ""
      };
    } else { // FR (default)
      return {
        prompt: "Je veux catégoriser les transactions de mon compte bancaire.",
        instruction: autoDestinationAccount 
          ? "Réponds UNIQUEMENT au format JSON suivant:\n{\n  \"category\": \"Nom de la catégorie\",\n  \"destinationAccount\": \"Nom du compte destinataire\"\n}\nPour le nom du compte, utilise seulement le nom de l'entreprise/merchant/entité (ex: 'Amazon', 'Generali', 'McDonald's'), pas la catégorie + nom d'entreprise."
          : "Réponds UNIQUEMENT au format JSON suivant:\n{\n  \"category\": \"Nom de la catégorie\"\n}\nDonne simplement le nom de la catégorie. Pas de phrase complète. Ignore toute longue chaîne de chiffres ou de caractères spéciaux.",
        subjectLanguage: "Le sujet est en français.",
        question: `Dans quelle catégorie une transaction (${type}) ${destinationText} avec le sujet "${description}" correspond-elle ?`,
        accountInstruction: autoDestinationAccount ? "Suggère aussi le compte destinataire le plus approprié dans la liste ci-dessous, ou suggère un nouveau nom de compte si aucun ne correspond. Utilise seulement le nom de l'entreprise/merchant:" : "",
        accountsList: autoDestinationAccount ? existingAccounts.join(", ") : ""
      };
    }
  }

  #parseResponse(response, categories, existingAccounts, autoDestinationAccount) {
    this.#debugLog("Parsing AI response", { response, autoDestinationAccount });

    try {
      // Essayer de parser le JSON directement
      const jsonResponse = JSON.parse(response);
      
      if (!autoDestinationAccount) {
        // Mode simple : seulement la catégorie
        const category = jsonResponse.category;
        if (categories.indexOf(category) === -1) {
          return {
            category: null,
            suggestedCategory: category
          };
        }
        return {
          category: category
        };
      }

      // Mode avancé : catégorie et compte destinataire
      const category = jsonResponse.category;
      const destinationAccount = jsonResponse.destinationAccount;
      
      const result = {
        category: categories.indexOf(category) !== -1 ? category : null,
        suggestedCategory: categories.indexOf(category) === -1 ? category : null,
        destinationAccount: existingAccounts.indexOf(destinationAccount) !== -1 ? destinationAccount : null,
        suggestedDestinationAccount: existingAccounts.indexOf(destinationAccount) === -1 ? destinationAccount : null
      };

      return result;
    } catch (jsonError) {
      this.#debugLog("JSON parsing failed, trying fallback", { 
        error: jsonError.message, 
        response 
      });

      // Fallback : essayer d'extraire le JSON du texte
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const jsonResponse = JSON.parse(jsonMatch[0]);
          
          if (!autoDestinationAccount) {
            const category = jsonResponse.category;
            if (categories.indexOf(category) === -1) {
              return {
                category: null,
                suggestedCategory: category
              };
            }
            return {
              category: category
            };
          }

          const category = jsonResponse.category;
          const destinationAccount = jsonResponse.destinationAccount;
          
          return {
            category: categories.indexOf(category) !== -1 ? category : null,
            suggestedCategory: categories.indexOf(category) === -1 ? category : null,
            destinationAccount: existingAccounts.indexOf(destinationAccount) !== -1 ? destinationAccount : null,
            suggestedDestinationAccount: existingAccounts.indexOf(destinationAccount) === -1 ? destinationAccount : null
          };
        } catch (fallbackError) {
          this.#debugLog("Fallback JSON parsing also failed", { 
            error: fallbackError.message,
            jsonMatch: jsonMatch[0]
          });
        }
      }

      // Dernier recours : traiter comme du texte simple
      const cleanResponse = response.trim();
      
      if (!autoDestinationAccount) {
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

      // Mode avancé avec texte simple - essayer de séparer par "|"
      const parts = cleanResponse.split('|');
      if (parts.length === 2) {
        const [category, account] = parts.map(part => part.trim());
        return {
          category: categories.indexOf(category) !== -1 ? category : null,
          suggestedCategory: categories.indexOf(category) === -1 ? category : null,
          destinationAccount: existingAccounts.indexOf(account) !== -1 ? account : null,
          suggestedDestinationAccount: existingAccounts.indexOf(account) === -1 ? account : null
        };
      }

      // Si pas de séparateur, traiter comme une catégorie simple
      return {
        category: categories.indexOf(cleanResponse) !== -1 ? cleanResponse : null,
        suggestedCategory: categories.indexOf(cleanResponse) === -1 ? cleanResponse : null,
        destinationAccount: null
      };
    }
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
