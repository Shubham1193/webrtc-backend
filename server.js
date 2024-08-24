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
import Submission from "./models/submissionSchema.js";


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
const client2 = createClient({url : 'rediss://red-cqailkuehbks73b22gvg:vTPutJypQOL8gt1libOtd1Xy84riwmrJ@oregon-redis.render.com:6379'});

client.on("error", (err) => console.log("Redis Client Error", err));
client2.on("error", (err) => console.log("Redis Client Error", err));

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
      if (length === 2) {
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
    // console.log(roomtoPeerid);
    // console.log(roomtouserid);
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

  // question sync logic
  socket.on("question", (data) => {
    socket.broadcast.to(data.id).emit("syncQuestion", data.ques);
  });

  // clear result on resubmit
  socket.on('clear-res', ({ id }) => {
    // console.log(id + "res clear")
    io.to(id).emit("clear-res" , "clear");
  })

  // user disconnect logic using button
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
  try {
    // Send initial response to submitting user
    console.log(req.body)
    res.status(200).send("submitted");

    let { code, userLang, id, question } = req.body;

    if (userLang === "python") {
      userLang = "py";
    }

    // Push submission data onto Redis list 'problems'
    await client.lPush(
      "problems",
      JSON.stringify({ id: id, code: code, language: userLang, question })
    );

    // Subscribe to channel 'id' to listen for result
    client2.subscribe(id, (message, channel) => {
      if (channel === id) {
        // Emit result to socket room (both users)
        io.to(id).emit("code-result", message);

        // Save to database for each user in the room
        roomtouserid[id].forEach(user => {
          saveData(user, question._id , question.title , code, userLang, JSON.parse(message));
        });

        // Unsubscribe after handling the message
        client2.unsubscribe(id, () => {
          console.log(`Unsubscribed from channel '${id}'`);
        });
      }
    });
  } catch (error) {
    console.error("Redis or submission error:", error);
    res.status(500).send("Failed to store submission or handle Redis subscription.");
  }
});

//save data
const saveData = async (userId, questionId, questionName , code, language, result) => {
  try {
    const sub = await Submission.findOneAndUpdate(
      { userId: userId, questionId: questionId },
      { code: code, language: language, result: result , questionName : questionName },
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
    await client2.connect();
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
