const express = require("express");
const http = require("http");
const axios = require('axios');
const qs = require('qs');
const cors = require('cors')
const app = express();
app.use(cors())
app.use(express.json())


app.post('/submit', async (req, res, next) => {
  
    let {code , userLang , id} = req.body; // Access data from the request body
    if(userLang == "python"){
      userLang = 'py'
    }
    const data = qs.stringify({'code' : code , 'language' : userLang})
    try {
      const response = await axios.post('https://api.codex.jaagrav.in', data); // Use axios for POST requests
      res.json(response.data); // Send the response data back to the client
      io.to(id).emit('code-result', response.data);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Error processing data" }); // Handle errors gracefully
    }
  
  
});



const server = http.createServer(app);
const io = require("socket.io")(server, { cors: true });

const users = {};
const socketToRoom = {};

io.on('connection', (socket) => {
  socket.on("join room", (id) => {
    socket.join(id)
  });

  
  socket.on("update-code", ({ id, code }) => {
    console.log(code, id)
    socket.broadcast.to(id).emit("updated-code", code);
  });

  socket.on('disconnect', () => {
    const id = socketToRoom[socket.id];
    let room = users[id];

    if (room) {
      room = room.filter((id) => id !== socket.id);
      users[id] = room;
    }

    socket.broadcast.emit('user-left', socket.id);
  });
});

server.listen(8000, () => console.log('server is running on port 8000'));
