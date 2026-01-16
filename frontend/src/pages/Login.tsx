import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";

export function LoginPage() {
  const { login, loading, error } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await login(username.trim(), password);
  };

  return (
    <div className="page page--login">
      <div className="panel panel--login">
        <h1>Entrar</h1>
        <p>Informe usuário e senha para acessar o painel.</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Usuário
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="alert alert--danger">{error}</p>}
          <button type="submit" className="button" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
