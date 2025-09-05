export default class OllamaService {
  #baseUrl;
  #model;
  #language;

  constructor(baseUrl = "http://localhost:11434", model = "llama3.2", language = "FR") {
    this.#baseUrl = baseUrl;
    this.#model = model;
    this.#language = language;
  }

  async classify(categories, destinationName, description, type) {
    try {
      const prompt = this.#generatePrompt(
        categories,
        destinationName,
        description,
        type
      );

      const response = await fetch(`${this.#baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.#model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.1,
            top_p: 0.9,
            max_tokens: 50,
          },
        }),
      });

      if (!response.ok) {
        throw new OllamaException(response.status, response, await response.text());
      }

      const result = await response.json();
      let guess = result.response;
      guess = guess.replace("\n", "");
      guess = guess.trim();

      if (categories.indexOf(guess) === -1) {
        console.warn(`Ollama could not classify the transaction. 
                Prompt: ${prompt}
                Ollama's guess: ${guess}
                Available categories: ${categories.join(", ")}`);
        return {
          prompt,
          response: result.response,
          category: null,
          suggestedCategory: guess, // Retourner la catégorie suggérée pour création
        };
      }

      return {
        prompt,
        response: result.response,
        category: guess,
      };
    } catch (error) {
      if (error.response) {
        console.error(error.response.status);
        console.error(error.response.data);
        throw new OllamaException(
          error.status,
          error.response,
          error.response.data
        );
      } else {
        console.error(error.message);
        throw new OllamaException(null, null, error.message);
      }
    }
  }

  #generatePrompt(categories, destinationName, description, type) {
    const languageConfig = this.#getLanguageConfig(destinationName, description, type);
    
    return `
${languageConfig.prompt}
${languageConfig.instruction}
${languageConfig.subjectLanguage}
${languageConfig.question}
The categories are: 

${categories.join(", ")}
`;
  }

  #getLanguageConfig(destinationName, description, type) {
    if (this.#language === "EN") {
      return {
        prompt: "I want to categorize transactions on my bank account.",
        instruction: "Just output the name of the category. Does not have to be a complete sentence. Ignore any long string of numbers or special characters.",
        subjectLanguage: "The subject is in English.",
        question: `In which category would a transaction (${type}) from "${destinationName}" with the subject "${description}" fall into?`
      };
    } else { // FR (default)
      return {
        prompt: "Je veux catégoriser les transactions de mon compte bancaire.",
        instruction: "Donne simplement le nom de la catégorie. Pas de phrase complète. Ignore toute longue chaîne de chiffres ou de caractères spéciaux.",
        subjectLanguage: "Le sujet est en français.",
        question: `Dans quelle catégorie une transaction (${type}) de "${destinationName}" avec le sujet "${description}" correspond-elle ?`
      };
    }
  }
}

class OllamaException extends Error {
  code;
  response;
  body;

  constructor(statusCode, response, body) {
    super(`Error while communicating with Ollama: ${statusCode} - ${body}`);

    this.code = statusCode;
    this.response = response;
    this.body = body;
  }
}
