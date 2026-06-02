This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Prerequisites: Setting Up Ollama

This chatbot project relies on a local [Ollama](https://ollama.com) instance to run AI models. Follow these steps to set up and run Ollama:

1. **Install Ollama**:
   - Download and install Ollama for your OS from the [Ollama website](https://ollama.com).

2. **Start Ollama**:
   - **Windows/macOS**: Ollama automatically starts as a background app. Look for the Ollama icon in your system tray.
   - **Linux / Manual command**: If it's not running, you can start it via terminal with:
     ```bash
     ollama serve
     ```

3. **Pull the Llama Model**:
   - The application is configured to detect and prefer `llama3.2:1b` for fast execution. Pull the model before running the project:
     ```bash
     # To pull the lightweight Llama 3.2 model (1.3 GB)
     ollama pull llama3.2:1b
     ```

4. **Verify Ollama is Active**:
   - Check the list of downloaded models and ensure the service is running:
     ```bash
     ollama list
     ```

## Getting Started

First, make sure Ollama is running, then start the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
