import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.FRONTEND_URL || "*" } });

const rooms = new Map();
const JDoodle_API_URL = "https://api.jdoodle.com/v1/execute"; // JDoodle API

// Handle socket connections
io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  socket.on("join", ({ roomId, userName }) => {
    if (!roomId || !userName) return socket.emit("error", "Invalid roomId or username");
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId).add(userName);
    socket.join(roomId);
    io.to(roomId).emit("userJoined", Array.from(rooms.get(roomId)));
  });

  socket.on("codeChange", ({ roomId, code }) => socket.to(roomId).emit("codeUpdate", code));
  socket.on("languageChange", ({ roomId, language }) => io.to(roomId).emit("languageUpdate", language));

  // Compile code using JDoodle API
  socket.on("compilecode", async ({ code, roomId, language }) => {
    try {
      const languageMapping = {
        javascript: { language: "nodejs", version: "4" },
        python: { language: "python3", version: "3.9.0" },
        java: { language: "java", version: "11.0.8" },
        cpp: { language: "cpp17", version: "17.0.1" },
        c: { language: "c", version: "5.1.0" }
      };

      if (!languageMapping[language]) {
        io.to(roomId).emit("codeResponse", { output: "Unsupported language" });
        return;
      }

      const response = await axios.post(JDoodle_API_URL, {
        clientId: process.env.JDOODLE_CLIENT_ID,
        clientSecret: process.env.JDOODLE_CLIENT_SECRET,
        script: code,
        language: languageMapping[language].language,
        versionIndex: languageMapping[language].version
      });

      io.to(roomId).emit("codeResponse", { output: response.data.output || "No Output" });
    } catch (error) {
      console.error("JDoodle Error:", error.message);
      io.to(roomId).emit("codeResponse", { output: "Error executing code." });
    }
  });

  socket.on("leaveRoom", ({ roomId, userName }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).delete(userName);
      if (rooms.get(roomId).size === 0) rooms.delete(roomId);
      io.to(roomId).emit("userJoined", Array.from(rooms.get(roomId) || []));
    }
    socket.leave(roomId);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
