import { useConfig } from "../providers/ConfigProvider";
import packageJson from "../../package.json";

export default function Footer() {
  const { config } = useConfig();
  const currentVersion = packageJson.version;

  return (
    <footer className="mt-auto py-3 bg-light border-top">
      <div className="container-fluid">
        <div className="row align-items-center">
          <div className="col-md-6">
            <small>
              <a
                href="https://github.com/pavelpernicka/scoutcomp"
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
                Made with <i className="fas fa-heart text-danger"></i> by Hruška
              </a>
            </small>
          </div>
        </div>
      </div>
    </footer>
  );
}
