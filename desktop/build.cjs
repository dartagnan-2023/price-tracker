const { execSync } = require("child_process");

function run(command) {
  execSync(command, { stdio: "inherit" });
}

run("npm --prefix ../backend run prisma:generate");
run("npm --prefix ../backend run build");
run("npm --prefix ../frontend run build");
