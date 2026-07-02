interface BaseTemplateOptions {
  title: string;
  bodyHtml: string;
  footerNote?: string;
}

export const buildBaseEmail = ({
  title,
  bodyHtml,
  footerNote,
}: BaseTemplateOptions): string => {
  const footerText = footerNote ?? `Copyright ${new Date().getFullYear()}`;

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
      <style>
        body {
          font-family: "Arial", sans-serif;
          background-color: #f8f9fa;
          color: #333;
          margin: 0;
          padding: 0;
          width: 100% !important;
          -webkit-text-size-adjust: 100%;
          -ms-text-size-adjust: 100%;
        }
        .container {
          max-width: 600px;
          background: #fff;
          margin: 20px auto;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
          border: 1px solid #ececec;
          width: 100%;
        }
        .header {
          background-color: #ffffff;
          color: #1f2937;
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 3px solid #DC2626;
        }
        .header img {
          width: 120px;
          height: auto;
        }
        .header h1 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #DC2626;
          text-align: right;
        }
        .content {
          padding: 20px;
        }
        .content p {
          font-size: 15px;
          line-height: 1.6;
          margin: 10px 0;
        }
        .content h2, .content h3 {
          font-size: 18px;
          margin: 15px 0 10px 0;
        }
        .card {
          background: #ffffff;
          padding: 12px;
          border-radius: 6px;
          margin: 12px 0;
          word-wrap: break-word;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0;
          table-layout: fixed;
        }
        th, td {
          padding: 8px 10px;
          border: 1px solid #e6e6e6;
          text-align: left;
          font-size: 14px;
          word-wrap: break-word;
        }
        th {
          background: #f9fafb;
          font-weight: 600;
        }
        .footer {
          background: #f8f9fa;
          text-align: center;
          padding: 20px;
          font-size: 13px;
          color: #4b5563;
          border-top: 3px solid #DC2626;
        }
        .footer p {
          margin: 5px 0;
        }
        .footer a {
          color: #DC2626;
          text-decoration: none;
        }
        .button {
          display: inline-block;
          padding: 10px 18px;
          background: #DC2626;
          color: #ffffff;
          text-decoration: none;
          border-radius: 5px;
          font-weight: 600;
        }
        @media only screen and (max-width: 600px) {
          .container {
            margin: 10px !important;
            border-radius: 8px !important;
            width: calc(100% - 20px) !important;
          }
          .header {
            padding: 15px !important;
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
          .header img {
            width: 100px !important;
            margin-bottom: 10px;
          }
          .header h1 {
            font-size: 18px !important;
            text-align: center;
          }
          .content {
            padding: 15px !important;
          }
          .content p {
            font-size: 14px !important;
          }
          .content h2, .content h3 {
            font-size: 16px !important;
          }
          .card {
            padding: 10px !important;
            margin: 10px 0 !important;
          }
          table {
            font-size: 13px !important;
          }
          th, td {
            padding: 6px 8px !important;
            font-size: 13px !important;
          }
          .footer {
            padding: 12px !important;
            font-size: 12px !important;
          }
          .button {
            padding: 8px 15px !important;
            font-size: 14px !important;
          }
        }
        @media only screen and (max-width: 400px) {
          .container {
            margin: 5px !important;
            width: calc(100% - 10px) !important;
          }
          .header img {
            width: 80px !important;
          }
          .header h1 {
            font-size: 16px !important;
          }
          .content p {
            font-size: 13px !important;
          }
          th, td {
            padding: 5px !important;
            font-size: 12px !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="https://flyeastnepal.com/logo/navlogo.png" alt="Fly East Nepal Logo" />
          <h1>${title}</h1>
        </div>
        <div class="content">
          ${bodyHtml}
        </div>
        <div class="footer">
          <p>${footerText}</p>
          <p style="margin-top: 10px; font-size: 12px;">Fly East Nepal | Travel with Confidence</p>
        </div>
      </div>
    </body>
  </html>
  `;
};
