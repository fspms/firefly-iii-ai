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

  async classify(categories, destinationName, description, type, existingAccounts = [], autoDestinationAccount = false, budgets = [], autoBudget = false) {
    try {
      this.#debugLog("Starting AI classification", {
        destinationName,
        description,
        type,
        categoriesCount: categories.length,
        existingAccountsCount: existingAccounts.length,
        autoDestinationAccount,
        budgetsCount: budgets.length,
        autoBudget
      });

      const prompt = this.#generatePrompt(
        categories,
        destinationName,
        description,
        type,
        existingAccounts,
        autoDestinationAccount,
        budgets,
        autoBudget
      );

      this.#debugLog("Generated prompt", { prompt });

      let response;
      if (this.#usesNewMaxCompletionTokens()) {
        response = await this.#openAi.chat.completions.create({
        model: this.#model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_completion_tokens: 1500,
      });
      } else {
        response = await this.#openAi.chat.completions.create({
        model: this.#model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 150,
      });
      }

      let guess = response.choices[0].message.content;
      guess = guess.replace("\n", "");
      guess = guess.trim();

      this.#debugLog("AI response received", { guess });

      // Parse the response to extract category, destination account and budget
      const result = this.#parseResponse(guess, categories, existingAccounts, autoDestinationAccount, budgets, autoBudget);

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

  #generatePrompt(categories, destinationName, description, type, existingAccounts = [], autoDestinationAccount = false, budgets = [], autoBudget = false) {
    const languageConfig = this.#getLanguageConfig(destinationName, description, type, existingAccounts, autoDestinationAccount, budgets, autoBudget);
    
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

    if (autoBudget && budgets.length > 0) {
      prompt += `

${languageConfig.budgetInstruction}
${languageConfig.budgetsList}
`;
    }

    return prompt;
  }

  #usesNewMaxCompletionTokens(){
    const normalizedModel = this.#model.toLowerCase();
    return (
      normalizedModel.startsWith("gpt-5") ||
      normalizedModel.startsWith("o") ||
      normalizedModel.startsWith("gpt-4.1") ||
      normalizedModel.startsWith("gpt-4o")
    )
  }

  #getLanguageConfig(destinationName, description, type, existingAccounts = [], autoDestinationAccount = false, budgets = [], autoBudget = false) {
    // Gérer le cas où destinationName est null ou "(unknown destination account)"
    const hasValidDestination = destinationName && destinationName !== "(unknown destination account)";
    const destinationText = hasValidDestination ? `de "${destinationName}"` : "";
    const destinationTextEN = hasValidDestination ? `from "${destinationName}"` : "";
    
    if (this.#language === "EN") {
      return {
        prompt: "I want to categorize transactions on my bank account.",
        instruction: this.#buildInstruction(autoDestinationAccount, autoBudget),
        subjectLanguage: "The subject is in English.",
        question: `In which category would a transaction (${type}) ${destinationTextEN} with the subject "${description}" fall into?`,
        accountInstruction: autoDestinationAccount ? "Also suggest the most appropriate destination account from the list below, or suggest a new account name if none match. Use only the company/merchant name:" : "",
        accountsList: autoDestinationAccount ? existingAccounts.join(", ") : "",
        budgetInstruction: autoBudget ? "Also suggest the most appropriate budget from the list below based on the category. Use only the budget name:" : "",
        budgetsList: autoBudget ? budgets.join(", ") : ""
      };
    } else { // FR (default)
      return {
        prompt: "Je veux catégoriser les transactions de mon compte bancaire.",
        instruction: this.#buildInstruction(autoDestinationAccount, autoBudget),
        subjectLanguage: "Le sujet est en français.",
        question: `Dans quelle catégorie une transaction (${type}) ${destinationText} avec le sujet "${description}" correspond-elle ?`,
        accountInstruction: autoDestinationAccount ? "Suggère aussi le compte destinataire le plus approprié dans la liste ci-dessous, ou suggère un nouveau nom de compte si aucun ne correspond. Utilise seulement le nom de l'entreprise/merchant:" : "",
        accountsList: autoDestinationAccount ? existingAccounts.join(", ") : "",
        budgetInstruction: autoBudget ? "Suggère aussi le budget le plus approprié dans la liste ci-dessous basé sur la catégorie. Utilise seulement le nom du budget:" : "",
        budgetsList: autoBudget ? budgets.join(", ") : ""
      };
    }
  }

  #buildInstruction(autoDestinationAccount, autoBudget) {
    const fields = ['"category": "Category name"'];
    
    if (autoDestinationAccount) {
      fields.push('"destinationAccount": "Account name"');
    }
    
    if (autoBudget) {
      fields.push('"budget": "Budget name"');
    }
    
    const jsonFormat = `{\n  ${fields.join(',\n  ')}\n}`;
    
    if (this.#language === "EN") {
      return `Respond ONLY in the following JSON format:\n${jsonFormat}\nFor the account name, use only the company/merchant/entity name (e.g., 'Amazon', 'Generali', 'McDonald's'), not the category + company name. For the budget, choose the most appropriate budget based on the category.`;
    } else {
      return `Réponds UNIQUEMENT au format JSON suivant:\n${jsonFormat}\nPour le nom du compte, utilise seulement le nom de l'entreprise/merchant/entité (ex: 'Amazon', 'Generali', 'McDonald's'), pas la catégorie + nom d'entreprise. Pour le budget, choisis le budget le plus approprié basé sur la catégorie.`;
    }
  }

  #parseResponse(response, categories, existingAccounts, autoDestinationAccount, budgets = [], autoBudget = false) {
    this.#debugLog("Parsing AI response", { response, autoDestinationAccount, autoBudget });

    try {
      // Essayer de parser le JSON directement
      const jsonResponse = JSON.parse(response);
      
      const category = jsonResponse.category;
      const destinationAccount = jsonResponse.destinationAccount;
      const budget = jsonResponse.budget;
      
      const result = {
        category: categories.indexOf(category) !== -1 ? category : null,
        suggestedCategory: categories.indexOf(category) === -1 ? category : null
      };

      if (autoDestinationAccount) {
        result.destinationAccount = existingAccounts.indexOf(destinationAccount) !== -1 ? destinationAccount : null;
        result.suggestedDestinationAccount = existingAccounts.indexOf(destinationAccount) === -1 ? destinationAccount : null;
      }

      if (autoBudget) {
        result.budget = budgets.indexOf(budget) !== -1 ? budget : null;
        result.suggestedBudget = budgets.indexOf(budget) === -1 ? budget : null;
      }

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
          
          const category = jsonResponse.category;
          const destinationAccount = jsonResponse.destinationAccount;
          const budget = jsonResponse.budget;
          
          const result = {
            category: categories.indexOf(category) !== -1 ? category : null,
            suggestedCategory: categories.indexOf(category) === -1 ? category : null
          };

          if (autoDestinationAccount) {
            result.destinationAccount = existingAccounts.indexOf(destinationAccount) !== -1 ? destinationAccount : null;
            result.suggestedDestinationAccount = existingAccounts.indexOf(destinationAccount) === -1 ? destinationAccount : null;
          }

          if (autoBudget) {
            result.budget = budgets.indexOf(budget) !== -1 ? budget : null;
            result.suggestedBudget = budgets.indexOf(budget) === -1 ? budget : null;
          }

          return result;
        } catch (fallbackError) {
          this.#debugLog("Fallback JSON parsing also failed", { 
            error: fallbackError.message,
            jsonMatch: jsonMatch[0]
          });
        }
      }

      // Dernier recours : traiter comme du texte simple
      const cleanResponse = response.trim();
      
      // Mode avancé avec texte simple - essayer de séparer par "|"
      const parts = cleanResponse.split('|');
      if (parts.length >= 2) {
        const [category, account, budget] = parts.map(part => part.trim());
        
        const result = {
          category: categories.indexOf(category) !== -1 ? category : null,
          suggestedCategory: categories.indexOf(category) === -1 ? category : null
        };

        if (autoDestinationAccount && account) {
          result.destinationAccount = existingAccounts.indexOf(account) !== -1 ? account : null;
          result.suggestedDestinationAccount = existingAccounts.indexOf(account) === -1 ? account : null;
        }

        if (autoBudget && budget) {
          result.budget = budgets.indexOf(budget) !== -1 ? budget : null;
          result.suggestedBudget = budgets.indexOf(budget) === -1 ? budget : null;
        }

        return result;
      }

      // Si pas de séparateur, traiter comme une catégorie simple
      const result = {
        category: categories.indexOf(cleanResponse) !== -1 ? cleanResponse : null,
        suggestedCategory: categories.indexOf(cleanResponse) === -1 ? cleanResponse : null
      };

      if (autoDestinationAccount) {
        result.destinationAccount = null;
      }

      if (autoBudget) {
        result.budget = null;
      }

      return result;
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
