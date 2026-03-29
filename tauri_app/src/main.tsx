import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import App from "./App";
import TrayPopup from "./components/TrayPopup";
import "./i18n";
import "./index.css";

const label = getCurrentWebviewWindow().label;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    {label === "tray-popup" ? <TrayPopup /> : <App />}
  </StrictMode>,
);
