import {defineConfig} from 'vite';
export default defineConfig({server:{proxy:{'/socket.io':{target:'http://127.0.0.1:3100',ws:true},'/api':'http://127.0.0.1:3100'}},build:{sourcemap:false}});
