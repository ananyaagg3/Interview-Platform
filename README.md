# 🚀 InterviewApp — AI-Powered Collaborative Technical Interview Platform

Conduct smarter interviews. Collaborate in real time.

🌐 **Live Demo:** https://interview-platform-rose.vercel.app/login

InterviewApp is a collaborative technical interview platform that enables interviewers and candidates to conduct remote coding interviews with a synchronized code editor, shared whiteboard, WebRTC-based audio/video calls, and AI-generated interview reports powered by Google Gemini.

---

## Tech Stack

**Frontend:** React, Vite, Tailwind CSS, React Router, Socket.io Client, Monaco Editor, Simple-Peer (WebRTC), React PDF Renderer

**Backend:** Node.js, Express.js, Socket.io, MongoDB, Mongoose

**AI & APIs:** Google Gemini AI, Resend API, Metered.ca TURN/STUN API

**Authentication:** JWT, BcryptJS

---

## Features

- Real-time collaborative Monaco code editor
- Shared interactive whiteboard with live synchronization
- WebRTC audio & video calling
- AI-generated candidate evaluation reports using Google Gemini
- Choose problem from problem bank or create custom interview questions.
- Interview dashboard for creating and managing sessions
- Secure JWT authentication il
- Export interview reports as PDF

---

## Project Structure

```text
Interview-Platform/
│
├── backend/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── socket/
│   └── server.js
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   ├── utils/
│   │   └── App.jsx
│
└── README.md
```

---

## Key APIs

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/signup` | Register a new user |
| POST | `/api/auth/login` | Login user |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/rooms/create` | Create interview room |
| GET | `/api/rooms/past` | Get previous interview sessions |
| GET | `/api/rooms/problems` | Fetch coding problems |
| GET | `/api/rooms/:roomId` | Get interview room details |
| GET | `/api/rooms/:roomId/report` | Get AI interview report |
| DELETE | `/api/rooms/:roomId` | Delete interview session |

---

## Local Setup

### 1. Clone the Repository

```bash
git clone https://github.com/HARSHITA0411/Interview-Platform.git
cd Interview-Platform
```

---

### 2. Backend Setup

Navigate to the backend directory and install dependencies:

```bash
cd backend
npm install
```

Create a `.env` file:

```env
PORT=5000
MONGODB_URI=your_database_url
JWT_SECRET=your_jwt_secret
GEMINI_API_KEY=your_gemini_api_key

Seed the database:

```bash
npm run seed
```

Start the backend server:

```bash
npm run dev
```

---

### 3. Frontend Setup

Open a new terminal and navigate to the frontend directory:

```bash
cd frontend
npm install
```

Create a `.env` file:

```env
VITE_API_URL=http://localhost:5000/api
```

Start the frontend:

```bash
npm run dev
```

---

### 4. Access the Application

- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:5000
