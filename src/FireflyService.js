import {getConfigVariable} from "./util.js";

export default class FireflyService {
    #BASE_URL;
    #PERSONAL_TOKEN;
    #DEBUG;

    constructor() {
        this.#BASE_URL = getConfigVariable("FIREFLY_URL")
        if (this.#BASE_URL.slice(-1) === "/") {
            this.#BASE_URL = this.#BASE_URL.substring(0, this.#BASE_URL.length - 1)
        }

        this.#PERSONAL_TOKEN = getConfigVariable("FIREFLY_PERSONAL_TOKEN")
        this.#DEBUG = getConfigVariable("DEBUG", "false") === "true";
    }

    #debugLog(message, data = null) {
        if (this.#DEBUG) {
            const timestamp = new Date().toISOString();
            console.log(`[DEBUG FireflyService ${timestamp}] ${message}`);
            if (data) {
                console.log(`[DEBUG FireflyService ${timestamp}] Data:`, JSON.stringify(data, null, 2));
            }
        }
    }

    async getCategories() {
        this.#debugLog("Fetching categories from Firefly III", { url: `${this.#BASE_URL}/api/v1/categories` });
        
        const response = await fetch(`${this.#BASE_URL}/api/v1/categories`, {
            headers: {
                Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            this.#debugLog("Error fetching categories", { status: response.status, error: errorText });
            throw new FireflyException(response.status, response, errorText)
        }

        const data = await response.json();
        this.#debugLog("Categories API response", { data });

        const categories = new Map();
        data.data.forEach(category => {
            categories.set(category.attributes.name, category.id);
        });

        this.#debugLog("Categories processed", { count: categories.size, categories: Array.from(categories.keys()) });
        return categories;
    }

    async setCategory(transactionId, transactions, categoryId) {
        const tag = getConfigVariable("FIREFLY_TAG", "AI categorized");

        const body = {
            apply_rules: true,
            fire_webhooks: true,
            transactions: [],
        }

        transactions.forEach(transaction => {
            let tags = transaction.tags;
            if (!tags) {
                tags = [];
            }
            tags.push(tag);

            body.transactions.push({
                transaction_journal_id: transaction.transaction_journal_id,
                category_id: categoryId,
                tags: tags,
            });
        })

        const response = await fetch(`${this.#BASE_URL}/api/v1/transactions/${transactionId}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new FireflyException(response.status, response, await response.text())
        }

        await response.json();
        console.info("Transaction updated")
    }

    async createWebhook(webhookUrl) {
        const webhookData = {
            title: "AI Categorizer",
            trigger: "STORE_TRANSACTION",
            response: "TRANSACTIONS", 
            delivery: "JSON",
            url: webhookUrl,
            active: true
        };

        const response = await fetch(`${this.#BASE_URL}/api/v1/webhooks`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(webhookData)
        });

        if (!response.ok) {
            throw new FireflyException(response.status, response, await response.text())
        }

        const result = await response.json();
        console.info("Webhook créé avec succès:", result.data.id);
        return result.data;
    }

    async checkExistingWebhook(webhookUrl) {
        const response = await fetch(`${this.#BASE_URL}/api/v1/webhooks`, {
            headers: {
                Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
            }
        });

        if (!response.ok) {
            throw new FireflyException(response.status, response, await response.text())
        }

        const data = await response.json();
        return data.data.find(webhook => webhook.attributes.url === webhookUrl);
    }

    async createCategory(categoryName) {
        const response = await fetch(`${this.#BASE_URL}/api/v1/categories`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
            },
            body: JSON.stringify({
                name: categoryName,
            }),
        });

        if (!response.ok) {
            throw new FireflyException(response.status, response, await response.text());
        }

        const result = await response.json();
        console.info(`Nouvelle catégorie créée: ${categoryName} (ID: ${result.data.id})`);
        return result.data.id;
    }

    async getDestinationAccounts() {
        const response = await fetch(`${this.#BASE_URL}/api/v1/accounts?type=expense`, {
            headers: {
                Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
            }
        });

        if (!response.ok) {
            throw new FireflyException(response.status, response, await response.text())
        }

        const data = await response.json();
        const accounts = new Map();
        data.data.forEach(account => {
            accounts.set(account.attributes.name, account.id);
        });

        return accounts;
    }

    async getBudgets() {
        this.#debugLog("Fetching budgets from Firefly III", { url: `${this.#BASE_URL}/api/v1/budgets` });
        
        const response = await fetch(`${this.#BASE_URL}/api/v1/budgets`, {
            headers: {
                Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            this.#debugLog("Error fetching budgets", { status: response.status, error: errorText });
            throw new FireflyException(response.status, response, errorText)
        }

        const data = await response.json();
        this.#debugLog("Budgets API response", { data });

        const budgets = new Map();
        data.data.forEach(budget => {
            budgets.set(budget.attributes.name, budget.id);
        });

        this.#debugLog("Budgets processed", { count: budgets.size, budgets: Array.from(budgets.keys()) });
        return budgets;
    }

    async createDestinationAccount(accountName) {
        const accountData = {
            name: accountName,
            type: "expense",
            account_role: "defaultAsset"
        };

        const response = await fetch(`${this.#BASE_URL}/api/v1/accounts`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(accountData)
        });

        if (!response.ok) {
            throw new FireflyException(response.status, response, await response.text())
        }

        const result = await response.json();
        console.info(`Nouveau compte destinataire créé: ${accountName} (ID: ${result.data.id})`);
        return result.data.id;
  }

  async removeTagFromTransaction(transactionId, tagName) {
    this.#debugLog("Removing tag from transaction", { transactionId, tagName });
    
    // Récupérer d'abord la transaction pour obtenir les tags actuels
    const response = await fetch(`${this.#BASE_URL}/api/v1/transactions/${transactionId}`, {
      headers: {
        Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.#debugLog("Error fetching transaction for tag removal", { status: response.status, error: errorText });
      throw new FireflyException(response.status, response, errorText);
    }

    const data = await response.json();
    const currentTags = data.data.attributes.tags || [];
    
    // Filtrer le tag à supprimer
    const updatedTags = currentTags.filter(tag => tag.name !== tagName);
    
    this.#debugLog("Updated tags after removal", { 
      originalTags: currentTags.map(t => t.name), 
      updatedTags: updatedTags.map(t => t.name) 
    });

    // Mettre à jour la transaction avec les nouveaux tags
    const updateResponse = await fetch(`${this.#BASE_URL}/api/v1/transactions/${transactionId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apply_rules: true,
        fire_webhooks: false, // Ne pas déclencher de webhook pour cette modification
        transactions: [{
          transaction_journal_id: data.data.attributes.transactions[0].transaction_journal_id,
          tags: updatedTags
        }]
      })
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      this.#debugLog("Error removing tag from transaction", { status: updateResponse.status, error: errorText });
      throw new FireflyException(updateResponse.status, updateResponse, errorText);
    }

    console.info(`Tag "${tagName}" supprimé de la transaction ${transactionId}`);
    this.#debugLog("Tag successfully removed", { transactionId, tagName });
  }

  async getTransactionsWithTag(tagName, limit = 100) {
    this.#debugLog("Fetching transactions with tag", { tagName, limit });
    
    // Récupérer les dernières transactions (les plus récentes en premier) avec les tags
    const response = await fetch(`${this.#BASE_URL}/api/v1/transactions?limit=${limit}&order_by=created_at&order_direction=desc&include=tags`, {
      headers: {
        Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.#debugLog("Error fetching transactions", { status: response.status, error: errorText });
      throw new FireflyException(response.status, response, errorText);
    }

    const data = await response.json();
    this.#debugLog("Transactions API response", { 
      totalTransactions: data.data.length,
      firstTransaction: data.data[0] ? {
        id: data.data[0].id,
        attributes: data.data[0].attributes
      } : null
    });

    // Filtrer les transactions qui ont le tag requis
    const filteredTransactions = data.data.filter(transaction => {
      // Vérifier différentes structures possibles pour les tags
      const tags1 = transaction.attributes.tags || [];
      const tags2 = transaction.tags || [];
      const tags3 = transaction.attributes.transactions?.[0]?.tags || [];
      
      this.#debugLog("Checking transaction tags", {
        transactionId: transaction.id,
        tags1: tags1.map(t => t.name || t),
        tags2: tags2.map(t => t.name || t),
        tags3: tags3.map(t => t.name || t),
        lookingFor: tagName,
        hasTag1: tags1.some(tag => (tag.name || tag) === tagName),
        hasTag2: tags2.some(tag => (tag.name || tag) === tagName),
        hasTag3: tags3.some(tag => (tag.name || tag) === tagName)
      });
      
      return tags1.some(tag => (tag.name || tag) === tagName) ||
             tags2.some(tag => (tag.name || tag) === tagName) ||
             tags3.some(tag => (tag.name || tag) === tagName);
    });

    this.#debugLog("Filtered transactions", { 
      total: data.data.length, 
      filtered: filteredTransactions.length,
      tagName 
    });

    return filteredTransactions;
  }

  async setCategoryAndDestination(transactionId, transactions, categoryId, destinationAccountId) {
        const tag = getConfigVariable("FIREFLY_TAG", "AI categorized");

        const body = {
            apply_rules: true,
            fire_webhooks: true,
            transactions: [],
        }

        transactions.forEach(transaction => {
            let tags = transaction.tags;
            if (!tags) {
                tags = [];
            }
            tags.push(tag);

            const transactionUpdate = {
                transaction_journal_id: transaction.transaction_journal_id,
                tags: tags,
            };

            if (categoryId) {
                transactionUpdate.category_id = categoryId;
            }

            if (destinationAccountId) {
                transactionUpdate.destination_id = destinationAccountId;
            }

            body.transactions.push(transactionUpdate);
        })

        const response = await fetch(`${this.#BASE_URL}/api/v1/transactions/${transactionId}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new FireflyException(response.status, response, await response.text())
        }

        await response.json();
        console.info("Transaction updated with category and destination account")
    }

    async setBudget(transactionId, budgetId) {
        this.#debugLog("Setting budget for transaction", { transactionId, budgetId });
        
        // Note: Firefly III doesn't have a direct API to link budgets to transactions
        // Budgets are typically managed through budget limits and rules
        // This is a placeholder for future implementation when the API becomes available
        
        console.warn(`Budget linking not yet implemented in Firefly III API. Budget ${budgetId} would be linked to transaction ${transactionId}`);
        this.#debugLog("Budget linking skipped - API not available", { transactionId, budgetId });
        
        // For now, we'll just log the intended action without throwing an error
        // This allows the rest of the transaction processing to continue
        return true;
    }
}

class FireflyException extends Error {
    code;
    response;
    body;

    constructor(statusCode, response, body) {
        super(`Error while communicating with Firefly III: ${statusCode} - ${body}`);

        this.code = statusCode;
        this.response = response;
        this.body = body;
    }
}