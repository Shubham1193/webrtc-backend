import express from "express";
import http from "http";
import cors from "cors";
import { createClient } from "redis";
import dotenv from "dotenv";
import mongoose from "mongoose";
import authRoutes from "./routes/authRoute.js";
import userRouter from "./routes/userRoute.js";
import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import os from "os";
import cluster from "cluster";
import Submission from "./models/submissionSchema.js";

// if (cluster.isPrimary) {
//   // console.log(`Number of CPUs is ${totalCPUs}`);
//   // console.log(`Primary ${process.pid} is running`);

//   // Fork workers.
//   for (let i = 0; i < 5; i++) {
//     cluster.fork();
//   }

//   cluster.on("exit", (worker, code, signal) => {
//     console.log(`worker ${worker.process.pid} died`);
//     console.log("Let's fork another worker!");
//     cluster.fork();
//   });
// } else {
dotenv.config();
const app = express();
app.use(express.json());

// database connection
mongoose
  .connect(process.env.MONGO)
  .then(() => {
    console.log("Database connected");
  })
  .catch((err) => {
    console.log(err);
  });

// middleware
app.use(cors());
app.use("/api/auth", authRoutes);
app.use("/api/user", userRouter);

//redis connection
const client = createClient({url : 'rediss://red-cqailkuehbks73b22gvg:vTPutJypQOL8gt1libOtd1Xy84riwmrJ@oregon-redis.render.com:6379'});
client.on("error", (err) => console.log("Redis Client Error", err));

//created websocket server
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: true });

let roomtouserid = {}; //while saving data to database
let roomtoPeerid = {}; // call function
const sockettopeerid = {}; // New variable to store socket.id to peerId mapping
const sockettousernameid = {}; // New variable to store socket.id to username.id
const socketoroomid = {};

// websocket logic start
io.on("connection", (socket) => {
  // user connection logic
  socket.on("join room", (data) => {
    const username = jwt.verify(data.username, process.env.JWT_SECRET);
    if (roomtoPeerid[data.id]) {
      const length = roomtoPeerid[data.id].length;
      if (length === 4) {
        socket.emit("room full");
        return;
      }
      roomtouserid[data.id].push(username.id);
      roomtoPeerid[data.id].push(data.peerId);
    } else {
      roomtouserid[data.id] = [username.id];
      roomtoPeerid[data.id] = [data.peerId];
    }
    socketoroomid[socket.id] = data.id;
    sockettopeerid[socket.id] = data.peerId;
    sockettousernameid[socket.id] = username.id;
    console.log(roomtoPeerid);
    console.log(roomtouserid);
    socket.join(data.id);
    const otheruser = roomtoPeerid[data.id].filter(
      (id) => id !== data.peerId
    );
    socket.emit("other user", otheruser);
  });

  // code sync logic
  socket.on("update-code", ({ id, code }) => {
    socket.broadcast.to(id).emit("updated-code", code);
  });

  socket.on("question", (data) => {
    socket.broadcast.to(data.id).emit("syncQuestion", data.ques);
  });

  socket.on("disco", ({ peerId, token }) => {
    const username = jwt.verify(token, process.env.JWT_SECRET);
    const usernameid = username.id;
    const room = socketoroomid[socket.id];

    if (room && roomtoPeerid[room]) {
      roomtoPeerid[room] = roomtoPeerid[room].filter(
        (peer) => peer !== peerId
      );

      if (roomtouserid[room]) {
        roomtouserid[room] = roomtouserid[room].filter(
          (user) => user !== usernameid
        );
      }

      if (roomtoPeerid[room].length === 0) {
        delete roomtoPeerid[room];
        delete roomtouserid[room];
      }
    }

    // console.log("Updated roomtoPeerid:", roomtoPeerid);
    // console.log("Updated roomtouserid:", roomtouserid);

    delete sockettopeerid[socket.id];
    delete sockettousernameid[socket.id];
    delete socketoroomid[socket.id];

    socket.broadcast.to(room).emit("userdisconnect", peerId);
  });

  socket.on("disconnect", () => {
    const username = sockettousernameid[socket.id];
    const peerId = sockettopeerid[socket.id];
    const room = socketoroomid[socket.id];

    if (room && roomtoPeerid[room]) {
      roomtoPeerid[room] = roomtoPeerid[room].filter(
        (peer) => peer !== peerId
      );

      if (roomtouserid[room]) {
        roomtouserid[room] = roomtouserid[room].filter(
          (user) => user !== username
        );
      }

      if (roomtoPeerid[room].length === 0) {
        delete roomtoPeerid[room];
        delete roomtouserid[room];
      }
    }

    // console.log("Updated roomtoPeerid:", roomtoPeerid);
    // console.log("Updated roomtouserid:", roomtouserid);

    delete sockettopeerid[socket.id];
    delete sockettousernameid[socket.id];
    delete socketoroomid[socket.id];

    socket.broadcast.to(room).emit("userdisconnect", peerId);
  });
});

// submit code logic
app.post("/submit", async (req, res) => {
  let { code, userLang, id, question } = req.body; // Access data from the request body
  if (userLang == "python") {
    userLang = "py";
  }
  try {
    await client.lPush(
      "problems",
      JSON.stringify({ id: id, code: code, language: userLang, question })
    );

    client.subscribe(id, (message, channel) => {
      if (channel === id) {
        // console.log(JSON.parse(message));
        io.to(id).emit("code-result", message); // Broadcast to the room
        // save to database 
        roomtouserid[id].map(user => {
          saveData(user, question._id, code, userLang, JSON.parse(message));
        })
        res.status(200).send(JSON.parse(message));
        client.unsubscribe(id); // Unsubscribe after receiving the message
      }
    });
  } catch (error) {
    console.error("Redis error:", error);
    res.status(500).send("Failed to store submission.");
  }
});

//save data
const saveData = async (userId, questionId, code, language, result) => {
  try {
    const sub = await Submission.findOneAndUpdate(
      { userId: userId, questionId: questionId },
      { code: code, language: language, result: result },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    // console.log("data saved" , sub)
  } catch (error) {
    console.error("Database save error:", error);
  }
};

// global catch for error handling
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";
  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
  });
});

// starting the server
async function startServer() {
  try {
    await client.connect();
    console.log("Connected to Redis");

    server.listen(8000, () => {
      console.log("Server is running on port 8000");
    });
  } catch (error) {
    console.error("Failed to connect to Redis", error);
  }
}
startServer();
// }
