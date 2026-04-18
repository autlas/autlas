import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app/i18n";
import "./app/index.css";
import "./app/App.css";
import Landing from "./Landing";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
);
