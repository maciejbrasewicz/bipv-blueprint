import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<main className="fatal"><h1>Nie udało się otworzyć studia.</h1><p>Sprawdź obsługę WebGL lub użyj aktualnej przeglądarki.</p><button onClick={()=>location.reload()}>Otwórz ponownie</button></main>:this.props.children;}
}
createRoot(document.getElementById("root")!).render(<StrictMode><ErrorBoundary><App/></ErrorBoundary></StrictMode>);
