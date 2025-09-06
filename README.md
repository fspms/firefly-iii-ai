# Firefly III AI

This project allows you to automatically categorize your expenses, manage destination accounts, and link transactions to budgets in [Firefly III](https://www.firefly-iii.org/) using artificial intelligence.

## 🚀 Features

- **Automatic categorization**: AI analyzes transactions and suggests appropriate categories
- **Smart category creation**: Creates new categories when no existing one matches
- **Destination account management**: Suggests and creates destination accounts automatically
- **Budget linking**: Associates transactions with appropriate budgets based on categories
- **Multi-language support**: French and English
- **Multiple AI providers**: OpenAI (cloud) or Ollama (local)
- **Automatic webhook setup**: Creates Firefly III webhooks automatically
- **Comprehensive logging**: Detailed logs for monitoring and debugging

## 🔄 How It Works

1. **Setup**: Application creates a webhook in Firefly III
2. **Trigger**: New transactions automatically trigger AI analysis
3. **Analysis**: AI examines transaction details (description, recipient, type)
4. **Suggestions**: AI proposes category, destination account, and budget
5. **Application**: Suggestions are automatically applied to the transaction

### Smart AI Mapping Examples
- "Home insurance" → Category "Insurance" + Budget "Housing"
- "Hairdresser" → Category "Personal care" + Budget "Beauty"
- "Grocery shopping" → Category "Food" + Budget "Groceries"

## 🔒 Privacy

**Data shared with AI**:
- Transaction description and destination account name
- Transaction type (expense/income)
- Names of existing categories, accounts, and budgets

## 📦 Quick Start

### 1. Get Required Credentials

**Firefly III Personal Access Token**:
1. Log in to Firefly III → "Options" > "Profile" > "OAuth"
2. Click "Create Personal Access Token" and copy the token

**OpenAI API Key** (recommended):
1. Create account at [OpenAI](https://platform.openai.com)
2. Generate API key at [API Keys page](https://platform.openai.com/account/api-keys)

### 2. Docker Setup

#### Option A: Docker Compose (Recommended)

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  firefly-ai:
    image: ghcr.io/fspms/firefly-iii-ai:latest
    ports:
      - "3000:3000"
    environment:
      # Required Configuration
      FIREFLY_URL: "https://your-firefly-instance.com"
      FIREFLY_PERSONAL_TOKEN: "your-personal-access-token"
      
      # AI Provider Configuration
      PROVIDER: "openai"  # or "ollama"
      OPENAI_API_KEY: "your-openai-api-key"
      OPENAI_MODEL: "gpt-3.5-turbo"
      
      # Ollama Configuration (if using Ollama)
      # OLLAMA_BASE_URL: "http://localhost:11434"
      # OLLAMA_MODEL: "llama3.2"
      
      # Features
      LANGUAGE: "EN"  # or "FR"
      AUTO_DESTINATION_ACCOUNT: "true"
      CREATE_DESTINATION_ACCOUNTS: "true"
      AUTO_BUDGET: "true"
      
      # Interface and Logging
      ENABLE_UI: "true"
      DEBUG: "false"
      PORT: "3000"
      
      # Webhook Auto-Setup
      WEBHOOK_URL: "https://your-domain.com:3000/webhook"
      
      # Tag Processing
      TAG_FILTER: "to-analyze"
      TAG_CHECK_INTERVAL: "60"
      TAG_LIMIT: "100"
      
      # Firefly III Tag
      FIREFLY_TAG: "AI categorized"
```



#### Option B: Docker Run

```bash
docker run -d \
  --name firefly-ai \
  -p 3000:3000 \
  -e FIREFLY_URL="https://your-firefly-instance.com" \
  -e FIREFLY_PERSONAL_TOKEN="your-personal-access-token" \
  -e PROVIDER="openai" \
  -e OPENAI_API_KEY="your-openai-api-key" \
  -e OPENAI_MODEL="gpt-3.5-turbo" \
  -e LANGUAGE="EN" \
  -e AUTO_DESTINATION_ACCOUNT="true" \
  -e CREATE_DESTINATION_ACCOUNTS="true" \
  -e AUTO_BUDGET="true" \
  -e ENABLE_UI="true" \
  -e WEBHOOK_URL="https://your-domain.com:3000/webhook" \
  ghcr.io/fspms/firefly-iii-ai:latest
```



## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| **Required** |
| `FIREFLY_URL` | - | Your Firefly III instance URL |
| `FIREFLY_PERSONAL_TOKEN` | - | Firefly III personal access token |
| **AI Provider** |
| `PROVIDER` | `openai` | AI provider: `openai` or `ollama` |
| `OPENAI_API_KEY` | - | OpenAI API key (required if using OpenAI) |
| `OPENAI_MODEL` | `gpt-3.5-turbo` | OpenAI model to use |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama base URL (required if using Ollama) |
| `OLLAMA_MODEL` | `llama3.2` | Ollama model to use |
| **Features** |
| `LANGUAGE` | `FR` | Language: `EN` or `FR` |
| `AUTO_DESTINATION_ACCOUNT` | `false` | Enable destination account suggestions |
| `CREATE_DESTINATION_ACCOUNTS` | `false` | Allow creation of new accounts |
| `AUTO_BUDGET` | `false` | Enable automatic budget linking |
| **Webhook** |
| `WEBHOOK_URL` | - | URL for automatic webhook creation |
| **Interface & Logging** |
| `ENABLE_UI` | `false` | Enable web monitoring interface |
| `DEBUG` | `false` | Enable detailed debug logging |
| `PORT` | `3000` | Application port |
| **Tag Processing** |
| `TAG_FILTER` | - | Only analyze transactions with this tag |
| `TAG_CHECK_INTERVAL` | `0` | Minutes between automatic tag checks (0=disabled) |
| `TAG_LIMIT` | `100` | Maximum transactions to process per check |
| **Firefly III** |
| `FIREFLY_TAG` | `AI categorized` | Tag to assign to processed transactions |

### AI Provider Configuration

#### OpenAI (Recommended)
- **Pros**: High accuracy, cloud-based, no local setup
- **Cons**: Requires API key, data sent to external service
- **Variables**:
  - `PROVIDER=openai`
  - `OPENAI_API_KEY` (required)
  - `OPENAI_MODEL` (optional, default: gpt-3.5-turbo)

#### Ollama (Local)
- **Pros**: Complete privacy, no API costs, runs locally
- **Cons**: Requires local setup, higher resource usage
- **Variables**:
  - `PROVIDER=ollama`
  - `OLLAMA_BASE_URL` (optional, default: http://localhost:11434)
  - `OLLAMA_MODEL` (optional, default: llama3.2)

## 🎯 Advanced Features

### Automatic Destination Account Management

**How it works**:
- AI analyzes transactions and suggests appropriate destination accounts
- Can create new accounts if no suitable existing account is found
- Uses smart matching based on transaction details


**Configuration**:
```yaml
AUTO_DESTINATION_ACCOUNT: "true"      # Enable suggestions
CREATE_DESTINATION_ACCOUNTS: "true"   # Allow creation
```

### Automatic Budget Linking

**How it works**:
- AI analyzes transaction categories and suggests appropriate budgets
- Uses intelligent mapping between categories and budgets
- Only uses existing budgets (no automatic creation)

**Configuration**:
```yaml
AUTO_BUDGET: "true"
```

### Processing Existing Transactions


**Configuration**:
```yaml
TAG_FILTER: "to-analyze"           # Tag for transactions to process
TAG_CHECK_INTERVAL: "60"           # Check every 60 minutes
TAG_LIMIT: "100"                   # Max transactions per check
```

**Workflow**:
1. Tag transactions in Firefly III with "to-analyze"
2. Call `/process-existing` endpoint
3. Tags are automatically removed after processing



## 🐛 Debug & Troubleshooting

### Enable Debug Mode
```yaml
DEBUG: "true"
```

### Common Issues

**Webhook not created**:
- Verify `WEBHOOK_URL` is correctly configured
- Ensure URL is accessible from Firefly III

**Transactions not processed**:
- Check webhook is active in Firefly III
- Review logs with `DEBUG=true`

**AI errors**:
- Verify API key is valid
- For Ollama, ensure service is running

### Useful Commands

```bash
# View logs
docker-compose logs -f firefly-ai

# Debug logs only
docker-compose logs -f firefly-ai | grep DEBUG

# Restart service
docker-compose restart firefly-ai

# Docker run logs
docker logs -f firefly-ai
```

## 🤝 Contributing

Contributions welcome! Please:
- Report bugs via GitHub issues
- Suggest improvements
- Submit pull requests

## 📞 Support

1. Check troubleshooting section above
2. Review [GitHub issues](https://github.com/your-repo/issues)
3. Create new issue if needed