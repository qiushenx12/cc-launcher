import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./assets/styles/theme.css";
import "./assets/styles/components.css";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
