import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  // StrictMode disabled temporarily for perf testing (re-enable before production)
  // StrictMode's double-render bypasses React.memo areEqual — masking our optimization
  <App />,
);
