# 🔍 Conan UI

A modern web interface for browsing and searching your Conan packages. Get a clear overview of your remote repositories with an intuitive, responsive design.

<img src="doc/package_binaries.png" alt="Package Binaries Screenshot" style="max-height: 400px;">

## 🚀 Getting Started

### Prerequisites
- Python 3.8+ and pip
- Node.js 16+ and npm

### Quick Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/roknus/conan-ui.git
   cd conan-ui
   ```

2. **Configure repositories** (create `config.json` file):
   ```bash
   # Copy the example configuration
   cp config.json.example config.json
   # Edit config.json with your Conan repositories
   ```
   
   Example `config.json`:
   ```json
   {
     "repositories": [
       {
         "name": "artifactory",
         "url": "https://your-artifactory.com/artifactory/api/conan/conan-repo",
         "user": "username",
         "password": "password",
         "is_default": true
       },
       {
         "name": "conan-center",
         "url": "https://center.conan.io"
       }
     ]
   }
   ```
   
   > 📚 See [REPOSITORIES.md](REPOSITORIES.md) for detailed configuration
   > 
   > 🔄 Upgrading from environment variables? See [MIGRATION.md](MIGRATION.md)

3. **Start the backend**:
   ```bash
   pip install -r requirements.txt
   python main.py
   ```

4. **Start the frontend** (in a new terminal):
   ```bash
   cd frontend
   npm install
   npm start
   ```

5. **Open your browser** to `http://localhost:3000`

### 🐳 Docker

For a one-command setup:

1. **Configure repositories** (create `config.json` file in root directory):
   ```bash
   # Copy the example configuration
   cp config.json.example config.json
   # Edit config.json with your Conan repositories
   ```
   
   Example `config.json`:
   ```json
   {
     "repositories": [
       {
         "name": "artifactory",
         "url": "https://your-artifactory.com/artifactory/api/conan/conan-repo",
         "user": "username",
         "password": "password",
         "is_default": true
       }
     ]
   }
   ```
   
   > 📚 See [REPOSITORIES.md](REPOSITORIES.md) for detailed configuration
   > 
   > 🔄 Upgrading from environment variables? See [MIGRATION.md](MIGRATION.md)
   >
   > 💡 In Docker, `config.json` is mounted to `/etc/conan-ui/config.json` in the container

2. **Start with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

3. **Open your browser** to `http://localhost:3000`

## 🤝 Contributing

Contributions welcome! Please feel free to submit pull requests or create issues for bugs and feature requests.

## 📝 License

GPL 3.0 License - see [LICENSE](LICENSE) file for details.
