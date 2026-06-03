# oasis-spa

This project is a full-stack web application for a spa management system, named Oasis Spa. It includes a React frontend (client) and a Node.js/Express backend (server).

## Project Structure

```
oasis-spa/
├── client/         # React frontend application (Vite)
│   ├── public/
│   ├── src/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── ...
├── server/         # Node.js backend application (Express)
│   ├── config/
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── sql/
│   ├── utils/
│   ├── app.js
│   ├── index.js
│   ├── package.json
│   └── ...
└── README.md       # This file
```

## Client (Frontend)

The client is a single-page application built with React and Vite.

### Technologies Used

- **Framework:** React
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Routing:** React Router DOM
- **HTTP Client:** Axios
- **State Management:** React Context API
- **Linting:** ESLint

### Setup and Running

1.  **Navigate to the client directory:**
    ```bash
    cd client
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The client application will be available at `http://localhost:5173` (or another port if 5173 is busy).

## Server (Backend)

The server is a RESTful API built with Node.js and Express.

### Technologies Used

- **Framework:** Express.js
- **Database:** PostgreSQL (`pg` library)
- **Authentication:** `bcryptjs` for password hashing, `express-session` for session management
- **Middleware:** `cors`
- **Environment Variables:** `dotenv`
- **Validation:** `validator`

### Setup and Running

1.  **Navigate to the server directory:**
    ```bash
    cd server
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Environment Variables:**
    Create a `.env` file in the `server` directory and add the required environment variables. Key variables include:

    - `DATABASE_URL` (Neon PostgreSQL connection string)
    - `JWT_SECRET` (used for JWT + session signing)
    - `CLIENT_URL` (URL of the client application for CORS)
    - `PORT` (Optional, defaults to 5000)
    - `NODE_ENV`

    Example `.env` file:

    ```env
    DATABASE_URL=postgresql://user:password@host:5432/oasis_spa?sslmode=require
    JWT_SECRET=your_very_secret_key_here
    PORT=5000
    CLIENT_URL=http://localhost:5173
    NODE_ENV=development
    ```

4.  **Database Setup:**
    Ensure your PostgreSQL database server is running. You may need to create the database specified in your environment variables. The application uses `connect-pg-simple` which can automatically create the `cs_sessions` table if it's missing. You might need to run the SQL scripts in `server/sql/schema.sql` manually to set up the other tables.

5.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The server will start on port 5000 by default (or the port specified in `.env`).
