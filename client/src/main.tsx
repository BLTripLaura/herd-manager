// Always use the secure address (sign-in only works over https)
if (location.protocol === "http:" && !/^(localhost|127\.)/.test(location.hostname)) location.replace("https://" + location.host + location.pathname + location.search + location.hash);
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

createRoot(document.getElementById("root")!).render(<App />);
