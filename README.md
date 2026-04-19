# 📦 AI Stock & Inventory Manager

A professional, full-stack inventory management system powered by **FastAPI**, **React**, and **Google Gemini AI**. This application allows users to manage stock, track audit logs, and perform **Visual Search** using advanced multimodal AI embeddings.

![Static Badge](https://img.shields.io/badge/Gemini-AI-blue)
![Static Badge](https://img.shields.io/badge/FastAPI-Production-green)
![Static Badge](https://img.shields.io/badge/React-Vite-purple)
![Static Badge](https://img.shields.io/badge/Supabase-Database-orange)

---

## ✨ Key Features

- **🤖 AI Visual Search**: Snap a photo of any product to find its location (box number), price, and current stock level using Gemini AI embeddings.
- **🔐 Admin Dashboard**: Secure authentication for administrators to add, edit, or delete inventory.
- **📝 Audit History**: Comprehensive logging of every stock adjustment and detail change for full transparency.
- **📱 Mobile Optimized**: Designed for mobile use-cases like warehouse scanning and quick on-the-go inventory checks.
- **📦 Box Management**: Organize products into physical boxes and track them easily.

---

## 🛠️ Technology Stack

- **Frontend**: React (Vite), Vanilla CSS (Custom UI Design), Lucide Icons.
- **Backend**: FastAPI (Python), Uvicorn (Production Server).
- **Database**: Supabase (PostgreSQL) with `pgvector` for high-performance AI similarity search.
- **AI/ML**: Google Gemini 1.5 Flash (for vision analysis) & Multimodal Embeddings (for vector search).
- **Authentication**: JWT (JSON Web Tokens) with Bcrypt hashing.

---

## 🚀 Getting Started

### Prerequisites

- Python 3.9+
- Node.js 18+
- Supabase Project
- Google Gemini API Key

### Backend Setup

1. Navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure environment variables in a `.env` file:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_anon_key
   GEMINI_API_KEY=your_gemini_api_key
   JWT_SECRET_KEY=your_secure_secret
   ```
5. Run the server:
   ```bash
   uvicorn main:app --reload
   ```

### Frontend Setup

1. Navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file:
   ```env
   VITE_API_BASE=http://localhost:8000/api
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

---

## 📡 Deployment

This project is configured for professional deployment:
- **Frontend**: Recommended on [Vercel](https://vercel.com).
- **Backend**: Recommended on [Render](https://render.com) or [Railway](https://railway.app).
- **Database**: Managed by [Supabase](https://supabase.com).

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
