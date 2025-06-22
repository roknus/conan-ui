# 🔍 Conan UI

A modern web application for visualizing and browsing Conan packages from local cache and remotes. This self-hosted solution provides a clean, intuitive interface similar to ConanCenter but for your local development environment and private remotes.

## ✨ Features

- **🔍 Search & Browse**: Search for Conan packages with an intuitive interface
- **📦 Package Details**: View comprehensive package information including:
  - Version information
  - Platform and compiler details
  - Settings and options
  - Dependencies and requirements
  - Package metadata
- **� Local & Remote Support**: Works with both local Conan cache and configured remotes
- **📱 Responsive Design**: Works beautifully on desktop and mobile devices
- **⚡ Modern Tech Stack**: Built with FastAPI and React TypeScript

## 🏗️ Architecture

### Backend (Python FastAPI)
- **FastAPI** server with RESTful APIs
- **Conan API Integration** using official Conan 2.0+ API
- **Async Architecture** for optimal performance
- **Pydantic Models** for data validation
- **Environment-based Configuration**

### Frontend (React TypeScript)
- **React 18** with TypeScript
- **Modern Component Architecture**
- **Responsive CSS Grid Layout**
- **Axios** for API communication
- **Clean, Modern UI Design**

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Node.js 16+
- Conan 2.0+ installed and configured

### Backend Setup

1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Install Python dependencies**:
   ```bash   pip install -r requirements.txt
   ```

3. **Configure environment variables (optional)**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with optional configuration:
   ```env
   # Optional: Custom Conan home directory
   CONAN_HOME=/path/to/custom/conan/home
   
   # Optional: Default remote name for searches
   DEFAULT_REMOTE=conancenter
   
   # Optional: CORS origins
   CORS_ORIGINS=http://localhost:3000
   ```

4. **Ensure Conan is configured**:
   ```bash
   # Verify Conan installation
   conan --version
   
   # List configured remotes (optional)
   conan remote list
   
   # Add a remote if needed (optional)
   conan remote add myremote https://my-conan-server.com/artifactory/api/conan/conan
   ```

5. **Start the backend server**:
   ```bash
   python main.py
   ```
   
   The API will be available at `http://localhost:8000`

### Frontend Setup

1. **Navigate to frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm start
   ```
   
   The application will open at `http://localhost:3000`

## 📊 API Endpoints

### Core Endpoints
- `GET /` - API information
- `GET /health` - Health check with Conan API availability
- `GET /packages?q={query}&remote_name={remote}` - Search packages
- `GET /packages/{name}?remote_name={remote}` - Get package versions
- `GET /packages/{name}/{version}?remote_name={remote}` - Get package variants
- `GET /packages/{name}/{version}/detail?remote_name={remote}` - Get package details
- `GET /repositories` - List Conan remotes and local cache

## 🔧 Configuration

### Environment Variables

#### Backend (.env) - All Optional
```env
# Optional: Custom Conan home directory
CONAN_HOME=/path/to/custom/conan/home

# Optional: Default remote name for searches
DEFAULT_REMOTE=conancenter

# Optional: CORS origins
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

#### Frontend (.env)
```env
REACT_APP_API_URL=http://localhost:8000
```

### Conan Setup

The backend uses your existing Conan configuration:

1. **Verify Conan Installation**:
   ```bash
   conan --version  # Should be 2.0+
   ```

2. **Configure Remotes** (if needed):
   ```bash
   # List current remotes
   conan remote list
   
   # Add a remote (example)
   conan remote add mycompany https://mycompany.jfrog.io/artifactory/api/conan/conan
   
   # Authenticate if needed
   conan remote login mycompany
   ```

3. **Local Cache**:
   - The API automatically detects your local Conan cache
   - No additional configuration required

## 🎨 UI Components

### SearchBar
- Real-time search functionality
- Clear search option
- Remote selection
- Responsive design

### PackageList
- Grid layout for package cards
- Package metadata display
- Click-to-view details

### PackageDetail
- Comprehensive package information
- Settings and options display
- Dependency visualization
- Mobile-friendly layout

## 🛠️ Development

### Project Structure
```
conan-ui/
├── backend/                 # FastAPI backend
│   ├── main.py             # Main application
│   ├── requirements.txt    # Python dependencies
│   └── .env.example        # Environment template
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── services/       # API services
│   │   ├── types/          # TypeScript types
│   │   └── App.tsx         # Main app component
│   └── package.json        # Node dependencies
└── README.md              # This file
```

### Adding New Features

1. **Backend**: Add new endpoints in `main.py`
2. **Frontend**: Create components in `src/components/`
3. **Types**: Update TypeScript interfaces in `src/types/`
4. **API**: Update service calls in `src/services/api.ts`

## 🐛 Troubleshooting

### Common Issues

1. **CORS Errors**:
   - Ensure `CORS_ORIGINS` includes your frontend URL
   - Check that backend is running on expected port

2. **Remote Connection**:
   - Check remote configuration with `conan remote list`
   - Test with `GET /health` endpoint

3. **Package Not Found**:
   - Check repository name in configuration
   - Verify token permissions

### Debugging

- Backend logs: Check console output when running `python main.py`
- Frontend debugging: Use browser developer tools
- API testing: Use `curl` or Postman to test endpoints

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues and questions:
- Create an issue in the GitHub repository
- Check the troubleshooting section above
- Verify your Conan remote configuration
