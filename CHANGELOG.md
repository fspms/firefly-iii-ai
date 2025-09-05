# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2024-01-15

### Changed
- **Project Name**: Renamed from "firefly-iii-ai-categorize" to "firefly-iii-ai"
- **Docker Image**: Updated to use new namespace `ghcr.io/fspms/firefly-iii-ai`
- **Repository URLs**: Updated to point to `github.com/fspms/firefly-iii-ai`

### Added
- **Automatic Webhook Setup**: Application can automatically create webhooks in Firefly III via API
- **Destination Account Management**: AI can suggest and create destination accounts for transactions
- **Tag-Based Filtering**: Process existing transactions based on specific tags
- **Periodic Tag Checking**: Automatic checking for tagged transactions at configurable intervals
- **Debug Mode**: Comprehensive debug logging for troubleshooting and monitoring
- **Multi-Language Support**: Full French and English language support
- **Multiple AI Providers**: Support for both OpenAI and Ollama (local AI)
- **Smart Transaction Processing**: Intelligent handling of unknown destination accounts
- **Enhanced Error Handling**: Better error management and logging throughout the application

### Changed
- **Version Bump**: Updated to version 2.0.0 to reflect major feature additions
- **OpenAI SDK**: Updated to version 4.0.0 for security improvements
- **Package Dependencies**: Updated all dependencies to latest secure versions
- **Documentation**: Comprehensive README with all new features and configuration options

### New Environment Variables
- `WEBHOOK_URL`: Enable automatic webhook creation
- `AUTO_DESTINATION_ACCOUNT`: Enable AI destination account suggestions
- `CREATE_DESTINATION_ACCOUNTS`: Allow creation of new destination accounts
- `TAG_FILTER`: Filter transactions by specific tag
- `TAG_CHECK_INTERVAL`: Minutes between automatic tag checks (0=disabled)
- `DEBUG`: Enable detailed debug logging

### New Endpoints
- `POST /process-existing`: Process existing transactions with specific tags

### Security
- Fixed high severity vulnerabilities in dependencies
- Updated OpenAI SDK to version 4.0.0
- All dependencies now use secure versions

### Performance
- Optimized transaction processing
- Improved memory usage
- Better error handling and recovery

## [1.0.0] - 2024-01-01

### Added
- Initial release
- Basic AI categorization for Firefly III transactions
- OpenAI integration
- Web interface for monitoring
- Docker support
