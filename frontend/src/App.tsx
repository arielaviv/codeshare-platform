import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { ComputerProvider } from './contexts/ComputerContext';
import { TakeoverHost } from './components/computer';
import AppLayout from './components/AppLayout';
import LandingPage from './pages/LandingPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import PostDetailPage from './pages/PostDetailPage';
import AIChatPage from './pages/AIChatPage';
import ProjectViewPage from './pages/ProjectViewPage';
import AuthCallback from './pages/AuthCallback';
import DecksPage from './pages/DecksPage';
import DeckEditorPage from './pages/DeckEditorPage';
import DeckPreviewPage from './pages/DeckPreviewPage';
import WelcomeSpinPage from './pages/WelcomeSpinPage';
import PricingPage from './pages/PricingPage';
import AccountPage from './pages/AccountPage';
import AnonBuildPage from './pages/AnonBuildPage';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex justify-center items-center h-screen bg-[#0A0A0A]"><div className="skeleton w-8 h-8 rounded-full" /></div>;
  if (!user) return <Navigate to="/" />;
  return <>{children}</>;
};

function SmartHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/landing" />;
  return <HomePage />;
}

function App() {
  return (
    <ComputerProvider>
      <Routes>
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
        <Route path="/build" element={<AnonBuildPage />} />
        <Route
          path="/welcome-spin"
          element={<ProtectedRoute><WelcomeSpinPage /></ProtectedRoute>}
        />

        <Route element={<AppLayout />}>
          <Route path="/" element={<SmartHome />} />
          <Route path="/feed" element={<HomePage />} />
          <Route path="/post/:id" element={<PostDetailPage />} />
          <Route path="/project/:id" element={<ProjectViewPage />} />
          <Route
            path="/chat"
            element={<ProtectedRoute><AIChatPage /></ProtectedRoute>}
          />
          <Route
            path="/profile/:id"
            element={<ProtectedRoute><ProfilePage /></ProtectedRoute>}
          />
          <Route
            path="/decks"
            element={<ProtectedRoute><DecksPage /></ProtectedRoute>}
          />
          <Route
            path="/decks/:id"
            element={<ProtectedRoute><DeckEditorPage /></ProtectedRoute>}
          />
        </Route>

        <Route
          path="/decks/:id/preview"
          element={<ProtectedRoute><DeckPreviewPage /></ProtectedRoute>}
        />
        <Route path="/decks/:id/public" element={<DeckPreviewPage />} />
      </Routes>
      <TakeoverHost />
    </ComputerProvider>
  );
}

export default App;
