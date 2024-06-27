
const express = require("express");
const http = require("http");

const app = express();
const server = http.createServer(app);
const socket = require("socket.io");
const io = socket(server , {cors : true});

const users = {};

const socketToRoom = {};

io.on('connection', socket => {
    
    socket.on("join room", id => {
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
        socket.join(id)
        socketToRoom[socket.id] = id;
        const usersInThisRoom = users[id].filter(id => id !== socket.id);
        // console.log(users)
        // console.log("/////////////////////////////////////")
        // console.log(socketToRoom)
        socket.emit("all users", usersInThisRoom);
    });

    socket.on("sending signal", payload => {
        io.to(payload.userToSignal).emit('user joined', { signal: payload.signal, callerID: payload.callerID });
    });

    socket.on("returning signal", payload => {
        io.to(payload.callerID).emit('receiving returned signal', { signal: payload.signal, id: socket.id });
    });

    socket.on("update-code" , ({id , code}) => {
        // io.to(id).emit("updated-code" , code) //everyone in room
        socket.broadcast.to(id).emit("updated-code" , code)
        console.log(code)
    })

    socket.on('disconnect', () => {
        const id = socketToRoom[socket.id];
        let room = users[id];
        if (room) {
            room = room.filter(id => id !== socket.id);
            users[id] = room;
          
        }
        socket.broadcast.emit('user-left' , socket.id)
    });

});

server.listen( 8000, () => console.log('server is running on port 8000'));


