import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import { Navbar } from "./components/Navbar";
import { BatchDetail } from "./pages/BatchDetail";
import { Batches } from "./pages/Batches";
import { Comparison } from "./pages/Comparison";
import { Dashboard } from "./pages/Dashboard";
import { ReviewMapping } from "./pages/ReviewMapping";
import { LoginPage } from "./pages/Login";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/batches" element={<Batches />} />
      <Route path="/batches/:id" element={<BatchDetail />} />
      <Route path="/review/:batch_id" element={<ReviewMapping />} />
      <Route path="/compare" element={<Comparison />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app">
          <Navbar />
          <main className="app__content">
            <AppRoutes />
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
