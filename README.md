# Firefly III AI

This project allows you to automatically categorize your expenses in [Firefly III](https://www.firefly-iii.org/) by
using OpenAI.


## Features

- **Automatic categorization**: Uses AI to guess the appropriate category for transactions
- **Automatic category creation**: Creates new categories if no existing one matches
- **Automatic destination account management**: AI suggests and creates destination accounts
- **Multi-language support**: Supports French and English
- **Multiple AI providers**: Choose between OpenAI and Ollama (local AI)
- **Automatic webhook setup**: Creates webhooks automatically via Firefly III API
- **User interface**: Web interface to monitor the categorization process
- **Smart transaction processing**: Handles both withdrawals and deposits
- **Comprehensive logging**: Detailed logs for monitoring and debugging

## How it works

The application provides a webhook that can be automatically set up to be called every time a new transaction is added to Firefly III.

### Automatic Setup
1. **Webhook Creation**: The application can automatically create the required webhook in Firefly III
2. **Transaction Processing**: When a new transaction is created, the webhook triggers the AI analysis

### AI Analysis
The AI analyzes the transaction and can suggest:
- **Category**: The most appropriate expense category
- **Destination Account**: The most suitable destination account (optional)

### Smart Processing
- **Existing Resources**: If the AI finds matching categories or accounts, they are applied directly
- **Auto-Creation**: If no suitable category or account exists, the AI can create new ones automatically
- **Multi-Language**: All suggestions are made in your preferred language (French/English)
- **Flexible Configuration**: You can enable/disable each feature independently

## Privacy

Please note that some details of the transactions will be sent to the AI provider as information to guess the category and destination account.

These are:

- Transaction description
- Name of transaction destination account
- Transaction type (withdrawal/deposit)
- Names of all existing categories
- Names of all existing destination accounts (if destination account management is enabled)

## Installation

### 1. Get a Firefly Personal Access Token

You can generate your own Personal Access Token on the Profile page. Login to your Firefly III instance, go to
"Options" > "Profile" > "OAuth" and find "Personal Access Tokens". Create a new Personal Access Token by clicking on
"Create New Token". Give it a recognizable name and press "Create". The Personal Access Token is pretty long. Use a tool
like Notepad++ or Visual Studio Code to copy-and-paste it.

![Step 1](docs/img/pat1.png)
![Step 2](docs/img/pat2.png)
![Step 3](docs/img/pat3.png)

### 2. Get an OpenAI API Key

The project needs to be configured with your OpenAI account's secret key.

- Sign up for an account by going to the OpenAI website (https://platform.openai.com)
- Once an account is created, visit the API keys page at https://platform.openai.com/account/api-keys.
- Create a new key by clicking the "Create new secret key" button.

When an API key is created you'll be able to copy the secret key and use it.

![OpenAI screenshot](docs/img/openai-key.png)

Note: OpenAI currently provides 5$ free credits for 3 months which is great since you won't have to provide your
payment details to begin interacting with the API for the first time.

After that you have to enable billing in your account.

Tip: Make sure to set budget limits to prevent suprises at the end of the month.

### 3. Choose AI Provider

The application supports two AI providers for categorization:

#### Option A: OpenAI (Cloud-based)
- **Pros**: High accuracy, no local setup required
- **Cons**: Requires API key, data sent to external service
- **Best for**: Users who prioritize accuracy and don't mind cloud processing

#### Option B: Ollama (Local AI)
- **Pros**: Complete privacy, no API costs, runs locally
- **Cons**: Requires local setup, higher resource usage
- **Best for**: Privacy-conscious users, those wanting to avoid API costs

Configure using the `PROVIDER` environment variable:
- `openai` (default): Use OpenAI API
- `ollama`: Use local Ollama instance

#### Installing Ollama (if using local AI)

If you choose to use Ollama, you'll need to install it first:

1. **Install Ollama**: Visit [https://ollama.ai](https://ollama.ai) and download the installer for your platform
2. **Pull a model**: Run `ollama pull llama3.2` (or your preferred model)
3. **Start Ollama**: The service should start automatically, or run `ollama serve`
4. **Verify installation**: Test with `curl http://localhost:11434/api/tags`

**Recommended models for categorization:**
- `llama3.2` (8B parameters) - Good balance of speed and accuracy
- `llama3.2:13b` (13B parameters) - Higher accuracy, slower
- `mistral` (7B parameters) - Fast and efficient

**OpenAI models (must be chat models):**
- `gpt-3.5-turbo` - Fast and cost-effective
- `gpt-4` - Higher accuracy, more expensive
- `gpt-4-turbo` - Best balance of speed and accuracy

### 4. Configure Language (Optional)

The application supports multiple languages for category generation. You can configure the language using the `LANGUAGE` environment variable:

- `FR` (default): French - Categories will be generated in French
- `EN`: English - Categories will be generated in English

This affects both the AI prompts and the automatically created categories.

### 5. Start the application via Docker

#### 5.1 Docker Compose

Create a new file `docker-compose.yml` with this content (or add to existing docker-compose file):

```yaml
version: "3.3"

services:
  categorizer:
    image: ghcr.io/fspms/firefly-iii-ai:latest
    restart: always
    ports:
      - "3000:3000"
    environment:
      FIREFLY_URL: "https://firefly.example.com"
      FIREFLY_PERSONAL_TOKEN: "eyabc123..."
      WEBHOOK_URL: "http://categorizer:3000/webhook"
      # AI Provider Configuration
      PROVIDER: "openai"  # or "ollama"
      # OpenAI Configuration (if PROVIDER=openai)
      OPENAI_API_KEY: "sk-abc123..."
      OPENAI_MODEL: "gpt-3.5-turbo"
      # Ollama Configuration (if PROVIDER=ollama)
      OLLAMA_BASE_URL: "http://ollama:11434"
      OLLAMA_MODEL: "llama3.2"
      # General Configuration
      LANGUAGE: "FR"  # Optional: FR for French (default), EN for English
```

Make sure to set the environment variables correctly.

Run `docker-compose up -d`.

Now the application is running and accessible at port 3000.

#### 5.2 Manually via Docker

Run this Docker command to start the application container. Edit the environment variables to match the credentials
created before.

```shell
# Using OpenAI
docker run -d \
-p 3000:3000 \
-e FIREFLY_URL=https://firefly.example.com \
-e FIREFLY_PERSONAL_TOKEN=eyabc123... \
-e PROVIDER=openai \
-e OPENAI_API_KEY=sk-abc123... \
-e OPENAI_MODEL=gpt-3.5-turbo \
-e LANGUAGE=FR \
ghcr.io/fspms/firefly-iii-ai:latest

# Using Ollama (requires Ollama running locally)
docker run -d \
-p 3000:3000 \
-e FIREFLY_URL=https://firefly.example.com \
-e FIREFLY_PERSONAL_TOKEN=eyabc123... \
-e PROVIDER=ollama \
-e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
-e OLLAMA_MODEL=llama3.2 \
-e LANGUAGE=FR \
ghcr.io/fspms/firefly-iii-ai:latest
```

### 6. Set up the webhook

#### Option A: Automatic configuration (Recommended)

The application can now automatically create the webhook via the Firefly III API. Simply add the `WEBHOOK_URL` environment variable:

```yaml
version: '3.3'

services:
  categorizer:
    image: ghcr.io/fspms/firefly-iii-ai:latest
    restart: always
    ports:
      - "3000:3000"
    environment:
      FIREFLY_URL: "https://firefly.example.com"
      FIREFLY_PERSONAL_TOKEN: "eyabc123..."
      OPENAI_API_KEY: "sk-abc123..."
      WEBHOOK_URL: "https://your-domain.com/webhook"  # ← New variable
```

The application will automatically check if a webhook already exists and create it if necessary on startup.

#### Option B: Manual configuration

If you prefer to configure the webhook manually:

- Login to your Firefly instance
- In the sidebar go to "Automation" > "Webhooks"
- Click "Create new webhook"
- Give the webhook a title. For example "AI Categorizer"
- Set "Trigger" to "After transaction creation" (should be the default)
- Set "Response" to "Transaction details" (should be the default)
- Set "Delivery" to "JSON" (should be the default)
- Set "URL" to the URL where the application is reachable + "/webhook". For example if you are using docker-compose your
  URL could look like this: `http://categorizer:3000/webhook`
- Click "Submit"

![Step 1](docs/img/webhook1.png)
![Step 2](docs/img/webhook2.png)
![Step 3](docs/img/webhook3.png)

Now you are ready and every new withdrawal transaction should be automatically categorized by OpenAI.

## Automatic Destination Account Management

The application can now also automatically suggest and create destination accounts for your transactions. This feature works alongside the category classification.

### How it works:

1. **Account Suggestion**: When `AUTO_DESTINATION_ACCOUNT=true`, the AI will analyze the transaction and suggest the most appropriate destination account from your existing expense accounts.

2. **Account Creation**: When `CREATE_DESTINATION_ACCOUNTS=true`, the AI will automatically create new destination accounts if no suitable existing account is found.

3. **Smart Matching**: The AI considers the transaction description, destination name, and existing account names to make intelligent suggestions.

### Configuration:

```yaml
environment:
  AUTO_DESTINATION_ACCOUNT: "true"  # Enable destination account suggestions
  CREATE_DESTINATION_ACCOUNTS: "true"  # Allow creation of new accounts
```

### Example:

For a transaction from "Amazon" with description "Online purchase", the AI might:
- Suggest existing account "Online Shopping" if it exists
- Create a new account "Amazon" if no suitable account exists and `CREATE_DESTINATION_ACCOUNTS=true`

## Advanced AI Features

### Multi-Provider Support

The application supports multiple AI providers:

#### OpenAI (Default)
- **Models**: GPT-3.5-turbo, GPT-4, and other OpenAI models
- **Configuration**: Set `PROVIDER=openai` and provide your `OPENAI_API_KEY`
- **Features**: Full support for all categorization and account management features

#### Ollama (Local AI)
- **Models**: Any Ollama-compatible model (llama3.2, mistral, etc.)
- **Configuration**: Set `PROVIDER=ollama` and configure `OLLAMA_BASE_URL`
- **Features**: Run AI processing locally for enhanced privacy
- **Requirements**: Ollama must be running on your system

### Smart Transaction Processing

The AI can process different types of transactions:

- **Withdrawals**: Expense transactions with category and destination account suggestions
- **Deposits**: Income transactions with appropriate categorization
- **Transfers**: Internal transfers between accounts

### Intelligent Matching

The AI uses multiple factors to make suggestions:

1. **Transaction Description**: Analyzes the description text for context
2. **Destination Name**: Considers the merchant or recipient name
3. **Transaction Type**: Takes into account whether it's income or expense
4. **Existing Data**: Compares against your current categories and accounts
5. **Language Context**: Understands the language of your transaction data

## Automatic Category Creation

One of the key features of this application is its ability to automatically create new categories when none of the existing ones match the transaction.

### How it works:

1. **Existing category match**: If OpenAI finds a matching existing category, it will be assigned to the transaction
2. **No match found**: If no existing category matches, the application will:
   - Create a new category with the name suggested by OpenAI
   - Assign this new category to the transaction
   - Add the "AI categorized" tag to the transaction

### Language Support:

The automatically created categories will be generated in the language specified by the `LANGUAGE` environment variable:
- **French (FR)**: Categories like "Assurance Habitation", "Courses", "Restaurant"
- **English (EN)**: Categories like "Home Insurance", "Groceries", "Restaurant"

This ensures that your categories are consistent with your preferred language and makes them more intuitive to use.

## Complete Configuration Example

Here's a complete Docker Compose configuration with all features enabled:

```yaml
version: '3.3'

services:
  firefly-iii-ai:
    image: ghcr.io/fspms/firefly-iii-ai:latest
    restart: always
    ports:
      - "3000:3000"
    environment:
      # Firefly III Configuration
      FIREFLY_URL: "https://your-firefly-instance.com"
      FIREFLY_PERSONAL_TOKEN: "your-personal-access-token"
      WEBHOOK_URL: "https://categorizer:3000/webhook"
      
      # AI Provider Configuration
      PROVIDER: "openai"  # or "ollama"
      OPENAI_API_KEY: "your-openai-api-key"
      OPENAI_MODEL: "gpt-3.5-turbo"
      
      # Ollama Configuration (if using Ollama)
      # OLLAMA_BASE_URL: "http://ollama:11434"
      # OLLAMA_MODEL: "llama3.2"
      
      # Language and Features
      LANGUAGE: "FR"  # or "EN"
      AUTO_DESTINATION_ACCOUNT: "true"
      CREATE_DESTINATION_ACCOUNTS: "true"
      
      # UI and Logging
      ENABLE_UI: "true"
      FIREFLY_TAG: "AI categorized"
      PORT: "3000"
```

### Feature Toggle Guide

| Feature | Variable | Default | Description |
|---------|----------|---------|-------------|
| **Webhook Auto-Setup** | `WEBHOOK_URL` | - | Set to enable automatic webhook creation |
| **Destination Accounts** | `AUTO_DESTINATION_ACCOUNT` | `false` | Enable AI destination account suggestions |
| **Auto-Create Accounts** | `CREATE_DESTINATION_ACCOUNTS` | `false` | Allow creation of new destination accounts |
| **Tag Filtering** | `TAG_FILTER` | - | Only analyze transactions with this tag |
| **Auto Tag Check** | `TAG_CHECK_INTERVAL` | `0` | Minutes between automatic tag checks (0=disabled) |
| **Tag Limit** | `TAG_LIMIT` | `100` | Maximum transactions to process per check |
| **User Interface** | `ENABLE_UI` | `false` | Enable web monitoring interface |
| **Language** | `LANGUAGE` | `FR` | Set to `EN` for English, `FR` for French |


## User Interface

The application comes with a minimal UI that allows you to monitor the classification queue and see the OpenAI prompts
and responses. This UI is disabled by default.

To enable this UI set the environment variable `ENABLE_UI` to `true`.

After a restart of the application the UI can be accessed at `http://localhost:3000/` (or any other URL that allows you
to reach the container).

## Adjust Tag name

The application automatically sets the tag "AI categorized" on every transaction that was processed and a category could
be guessed.

You can configure the name of this tag by setting the environment variable `FIREFLY_TAG` accordingly.

## Running on a different port

If you have to run the application on a different port than the default port `3000` set the environment variable `PORT`.

## Tag Filtering for Existing Transactions

The application can process existing transactions based on specific tags, allowing you to analyze a backlog of transactions that haven't been processed by the AI yet.

### How Tag Filtering Works

1. **Webhook Processing**: New transactions via webhook are always processed (no tag filtering)
2. **Existing Transactions**: Use the `/process-existing` endpoint to process transactions with a specific tag
3. **Tag-Based Selection**: Only transactions with the specified tag will be analyzed

### Configuration

```yaml
environment:
  TAG_FILTER: "to-analyze"  # Tag to identify transactions to process
  TAG_CHECK_INTERVAL: "5"   # Check every 5 minutes (0 to disable)
  TAG_LIMIT: "100"          # Process up to 100 transactions per check
```

### Processing Existing Transactions

**Automatic Processing:**
- Set `TAG_CHECK_INTERVAL` to a value > 0 to enable automatic checking
- The application will check for tagged transactions at the specified interval
- First check happens immediately when the application starts

**Manual Processing:**
To process existing transactions manually, make a POST request to the `/process-existing` endpoint:

```bash
curl -X POST http://categorizer:3000/process-existing
```

### Use Cases

- **Backlog Processing**: Process old transactions that were created before the AI system
- **Selective Analysis**: Analyze only specific types of transactions
- **Testing**: Test the AI on a subset of transactions before full deployment
- **Batch Processing**: Process transactions in batches by tagging them

### Example Workflow

1. **Tag Transactions**: In Firefly III, add the tag "to-analyze" to transactions you want processed
2. **Configure Filter**: Set `TAG_FILTER=to-analyze` in your environment
3. **Process Existing**: Call the `/process-existing` endpoint to analyze tagged transactions
4. **Automatic Cleanup**: Tags are automatically removed after successful processing

### Important Notes

- **Webhook Independence**: Tag filtering only affects the `/process-existing` endpoint, not webhook processing
- **New Transactions**: All new transactions via webhook are processed automatically
- **Tag Required**: The `TAG_FILTER` variable must be set to use the `/process-existing` endpoint
- **Latest Transactions**: By default, only the 100 most recent transactions are processed per check
- **Configurable Limit**: Use `TAG_LIMIT` to adjust the maximum number of transactions processed
- **Automatic Tag Removal**: The processing tag is automatically removed after successful processing to prevent loops

## Debug Mode

The application includes comprehensive debug logging to help troubleshoot issues and monitor the AI processing workflow.

### Enable Debug Mode

Set the `DEBUG` environment variable to `true`:

```yaml
environment:
  DEBUG: "true"
```

### Debug Information

When debug mode is enabled, the application will log detailed information about:

- **Webhook Processing**: Complete webhook payloads and headers
- **AI Classification**: Input data, prompts, and AI responses
- **Firefly III API**: All API calls, responses, and errors
- **Category Management**: Category retrieval, creation, and assignment
- **Account Management**: Destination account operations
- **Transaction Processing**: Step-by-step transaction processing
- **Error Handling**: Detailed error information and stack traces

### Debug Log Format

Debug logs include timestamps and service identification:

```
[DEBUG 2024-01-15T10:30:45.123Z] Starting AI classification
[DEBUG FireflyService 2024-01-15T10:30:45.124Z] Fetching categories from Firefly III
[DEBUG 2024-01-15T10:30:45.125Z] Data: {"categories": ["Food", "Transport"]}
```


## Use Cases and Benefits

### For Personal Finance Management
- **Automated Organization**: Never manually categorize transactions again
- **Consistent Categorization**: AI ensures consistent category naming and usage
- **Time Saving**: Reduces manual data entry time by 90%+
- **Multi-Language Support**: Works seamlessly in French or English

### For Business Accounting
- **Expense Tracking**: Automatically categorize business expenses
- **Account Management**: Smart destination account suggestions for better bookkeeping
- **Audit Trail**: All AI decisions are logged and traceable
- **Scalability**: Handles high transaction volumes automatically

### For Financial Advisors
- **Client Onboarding**: Quickly set up organized financial data for new clients
- **Data Quality**: Ensures consistent and accurate transaction categorization
- **Reporting**: Clean, organized data makes reporting and analysis easier
- **Compliance**: Maintains detailed logs of all automated decisions

### Key Advantages
- **Zero Manual Work**: Fully automated transaction processing
- **Intelligent Learning**: AI learns from your existing categories and accounts
- **Flexible Configuration**: Enable only the features you need
- **Privacy Options**: Choose between cloud AI (OpenAI) or local AI (Ollama)
- **Easy Setup**: Automatic webhook configuration and one-command deployment

## Full list of environment variables

### Required Variables
- `FIREFLY_URL`: The URL to your Firefly III instance. Example: `https://firefly.example.com`. (required)
- `FIREFLY_PERSONAL_TOKEN`: A Firefly III Personal Access Token. (required)

### AI Provider Configuration
- `PROVIDER`: The AI provider to use. `openai` (default) or `ollama`. (optional)

### OpenAI Configuration (if PROVIDER=openai)
- `OPENAI_API_KEY`: The OpenAI API Key to authenticate against OpenAI. (required if using OpenAI)
- `OPENAI_MODEL`: The OpenAI model to use. (Default: `gpt-3.5-turbo`) - Must be a chat model

### Ollama Configuration (if PROVIDER=ollama)
- `OLLAMA_BASE_URL`: The URL to your Ollama instance. (Default: `http://localhost:11434`)
- `OLLAMA_MODEL`: The Ollama model to use. (Default: `llama3.2`)

### General Configuration
- `LANGUAGE`: The language for category generation. `FR` for French (default), `EN` for English. (optional)
- `WEBHOOK_URL`: The URL where the webhook will be created. Example: `https://your-domain.com:3000/webhook`. (optional, enables automatic webhook creation)
- `AUTO_DESTINATION_ACCOUNT`: Whether to automatically suggest destination accounts. `true` or `false` (Default: `false`)
- `CREATE_DESTINATION_ACCOUNTS`: Whether to automatically create new destination accounts if they don't exist. `true` or `false` (Default: `false`)
- `DEBUG`: Enable detailed debug logging. `true` or `false` (Default: `false`)
- `TAG_FILTER`: Only analyze transactions with this specific tag. If empty, all transactions are analyzed. (Default: empty)
- `TAG_CHECK_INTERVAL`: Interval in minutes for automatic tag checking. Set to 0 to disable. (Default: `0`)
- `TAG_LIMIT`: Maximum number of transactions to process per tag check. (Default: `100`)
- `ENABLE_UI`: If the user interface should be enabled. (Default: `false`)
- `FIREFLY_TAG`: The tag to assign to the processed transactions. (Default: `AI categorized`)
- `PORT`: The port where the application listens. (Default: `3000`)

