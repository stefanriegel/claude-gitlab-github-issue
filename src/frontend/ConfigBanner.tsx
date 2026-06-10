import React from 'react';

export const ConfigBanner: React.FC = () => {
  const configExample = `{
  "token": "ghp_xxxxxxxxxxxxxxxxxxxx",
  "owner": "your-username",
  "repo": "your-repo-name",
  "enabled": true
}`;

  return (
    <div className="cgi-config-banner">
      <div className="cgi-config-banner-icon">⚙️</div>
      <h2>GitHub Issues Board Not Configured</h2>
      <p>
        To enable the GitHub Issues Kanban board, create a configuration file in your project.
      </p>
      <div>
        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, textAlign: 'left', opacity: 0.7 }}>
          File path: <code style={{ background: 'rgba(0,0,0,0.15)', padding: '1px 5px', borderRadius: 4 }}>.taskmaster/github-sync.json</code>
        </div>
        <pre className="cgi-config-code">{configExample}</pre>
      </div>
      <p style={{ fontSize: 12, opacity: 0.65 }}>
        Generate a GitHub personal access token at{' '}
        <strong>github.com → Settings → Developer settings → Personal access tokens</strong>.
        Required scopes: <code style={{ background: 'rgba(0,0,0,0.1)', padding: '1px 4px', borderRadius: 3 }}>repo</code>
      </p>
      <p style={{ fontSize: 12, opacity: 0.65 }}>
        The <strong>/github-task</strong> CLI skill is automatically installed when this plugin loads.
      </p>
    </div>
  );
};
