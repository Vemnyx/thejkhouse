import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import HostPage from "./pages/HostPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

function AppRoutes() {
  const { appUser, firebaseUser, loading } = useAuth();

  if (loading) {
    return (
      <main className="page">
        <p className="loading-text">Loading...</p>
      </main>
    );
  }

  if (!firebaseUser || !appUser) {
    return (
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/parties" element={<HomePage />} />
      <Route path="/photos" element={<HomePage />} />
      <Route path="/events" element={<HomePage />} />
      <Route path="/host" element={<HostPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
