import { createApp } from 'vue';
import './pip-video/style.css';
import PipVideoApp from './pip-video/App.vue';

const preview = window.location.hash === '#preview';
createApp(PipVideoApp, { preview }).mount('#app');
