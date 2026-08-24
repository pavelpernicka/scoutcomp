import React from "react";
import { useTranslation } from "react-i18next";
import { useConfig } from "../providers/ConfigProvider";
import packageJson from "../../package.json";

export default function Footer() {
  const { t } = useTranslation();
  const { config } = useConfig();
  const currentVersion = packageJson.version;

  return (
    <footer className="mt-auto py-3 bg-light border-top">
      <div className="container-fluid">
        <div className="row align-items-center">
          <div className="col-md-6">
            <small>
              <a
                href="https://scoutcomp.pernicka.cz"
                target="_blank"
                rel="noopener noreferrer"
                className="link-primary"
                style={{ fontSize: 'inherit' }}
              >
                {config.app_name} v{currentVersion}
              </a>
            </small>
          </div>
          <div className="col-md-6 text-md-end">
            <small>
              <a
                href="https://pernicka.cz"
                target="_blank"
                rel="noopener noreferrer"
                className="link-primary"
                style={{ fontSize: 'inherit' }}
              >
                {t("footer.madeWith")} <i className="fas fa-heart text-danger"></i> {t("footer.byAuthor", { author: "Hruška" })}
              </a>
            </small>
          </div>
        </div>
      </div>
    </footer>
  );
}
