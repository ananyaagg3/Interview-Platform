import { io } from 'socket.io-client';

let URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '') : 'http://localhost:5000';
URL = URL.replace(/\/$/, '');

export const socket = io(URL, {
  autoConnect: false
});
