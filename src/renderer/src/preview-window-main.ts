import { createApp } from 'vue';
import App from './preview/App.vue';
import './assets/main.css';

// Osobny entry okna podglądu (jak pip.html / audio-pip.html): minimalny app —
// bez routera/pinia/i18n, bo to jednorazowa powłoka wokół `<webview>`.
createApp(App).mount('#app');
