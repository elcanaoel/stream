@echo off
echo Installing dependencies...
npm install

echo Building React frontend...
cd src\client
npm run build
cd ..\..

echo Setup complete!
echo To start the server, run: node src\server\server.js
echo Then open your browser to http://localhost:5000