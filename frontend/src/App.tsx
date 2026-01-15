import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import { Navbar } from "./components/Navbar";
import { BatchDetail } from "./pages/BatchDetail";
import { Batches } from "./pages/Batches";
import { Comparison } from "./pages/Comparison";
import { Dashboard } from "./pages/Dashboard";
import { ReviewMapping } from "./pages/ReviewMapping";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Navbar />
        <main className="app__content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/batches" element={<Batches />} />
            <Route path="/batches/:id" element={<BatchDetail />} />
            <Route path="/review/:batch_id" element={<ReviewMapping />} />
            <Route path="/compare" element={<Comparison />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
