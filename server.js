const express = require("express");
const http = require("http");
const axios = require('axios');
const qs = require('qs');
const cors = require('cors')
const app = express();
app.use(cors())
app.use(express.json())

var data = qs.stringify({
  'code': 'val = int(input("Enter your value: ")) + 5\nprint(val)',
  'language': 'py',
  'input': '7'
});
// Assuming the endpoint expects JSON data:
// app.post('/submit', async (req, res, next) => {
//   const data = req.body;
//   console.log(req.body)
//   // const code = qs.stringify(data)
//   // try {
//   //   const response = await axios.post('https://api.codex.jaagrav.in', code); // Use axios for POST requests
//   //   res.json(response.data); // Send the response data back to the client
//   // } catch (error) {
//   //   console.error(error);
//   //   res.status(500).json({ message: "Error processing data" }); // Handle errors gracefully
//   // }
//   res.send(data)
// });

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
    if (users[id]) {
      const length = users[id].length;
      if (length === 3) {
        socket.emit("room full");
        return;
      }
      users[id].push(socket.id);
    } else {
      users[id] = [socket.id];
    }

    socket.join(id);
    socketToRoom[socket.id] = id;

    const usersInThisThisRoom = users[id].filter((id) => id !== socket.id);
    socket.emit("all users", usersInThisThisRoom);
  });

  socket.on("sending signal", (payload) => {
    io.to(payload.userToSignal).emit('user joined', { signal: payload.signal, callerID: payload.callerID });
  });

  socket.on("returning signal", (payload) => {
    io.to(payload.callerID).emit('receiving returned signal', { signal: payload.signal, id: socket.id });
  });

  socket.on("update-code", ({ id, code }) => {
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
