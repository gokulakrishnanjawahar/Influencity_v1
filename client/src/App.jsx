// ─────────────────────────────────────────────
// App.jsx — Route Definitions
// ─────────────────────────────────────────────

import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Browse from "@/pages/Browse";
import CreateCampaign from "@/pages/CreateCampaign";
import CampaignDetail from "@/pages/CampaignDetail";
import CreatorProfile from "@/pages/CreatorProfile";
import NotFound from "@/pages/NotFound";

export default function App() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/campaigns/browse" element={<Browse />} />
        <Route path="/campaigns/new" element={<CreateCampaign />} />
        <Route path="/campaigns/:id" element={<CampaignDetail />} />
        <Route path="/profile/:address" element={<CreatorProfile />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
  );
}