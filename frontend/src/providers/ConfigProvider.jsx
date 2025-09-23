import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import PropTypes from "prop-types";

import api from "../services/api";

const ConfigContext = createContext(undefined);
 
const DEFAULT_CONFIG = { // unify one definition with backend
  app_name: "ScoutComp",
  leaderboard_default_view: "total"
};

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchConfig = async () => {
    try {
      const { data } = await api.get("/config");
      setConfig(data);
    } catch (error) {
      console.warn("Could not fetch config, using defaults:", error.message);
      setConfig(DEFAULT_CONFIG);
    } finally {
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const value = {
    config,
    isLoaded,
    refetchConfig: fetchConfig,
  };

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  );
}

ConfigProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return context;
}
