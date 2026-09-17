export interface InvoiceTemplateData {
  bookingReference: string;
  primaryContact: {
    fullName: string;
    email: string;
    phoneNumber?: string;
    country?: string;
  };
  invoiceDate: string;
  dueDate: string;
  startDate: string;
  endDate: string;
  packageName: string;
  duration: string | number;
  totalPeople: number;
  basePricePerPerson: number;
  originalTotal: number;
  discountPercentage: number;
  discountAmount: number;
  totalAmount: number;
  status?: string; // e.g., CONFIRMED, PENDING, CANCELLED
  logoUrl?: string;
}

const formatCurrency = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });

const formatDuration = (duration: string | number) =>
  typeof duration === "number" ? `${duration} Days` : duration;

/**
 * Returns a 4-digit zero-padded number string starting from 0001.
 * Pass a sequence number (1,2,3,...) and it will format it as 0001, 0002, ... 9999.
 * Defaults to 1 -> "0001" if no argument is provided.
 */
export const dynamicNumber = (
  sequence: number = 1,
  width: number = 3
): string => String(Math.max(1, Math.floor(sequence))).padStart(width, "0");

/**
 * Renders the invoice HTML using the provided data.
 * This is email-friendly HTML (inline-friendly with simple layout and minimal images).
 */
export function renderInvoiceTemplate(data: InvoiceTemplateData): string {
  const {
    bookingReference,
    primaryContact,
    invoiceDate,
    dueDate,
    startDate,
    endDate,
    packageName,
    duration,
    totalPeople,
    basePricePerPerson,
    originalTotal,
    discountPercentage,
    discountAmount,
    totalAmount,
    status = "CONFIRMED",
    logoUrl = "https://res.cloudinary.com/dmoxnrknc/image/upload/v1760859030/final_xouhwg.png",
  } = data;

  return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Invoice #${bookingReference}</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            background-color: #f3f4f6;
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            color: #111827;
            line-height: 1.5;
        }

        #invoice-content {
            background-color: #fff;
            max-width: 800px;
            margin: 0 auto;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }

        .invoice-header {
            text-align: center;
            padding: 30px;
            background-color: #f8f9fa;
            border-bottom: 2px solid #dee2e6;
        }

        .invoice-header h1 {
            font-size: 2.5rem;
            font-weight: bold;
            margin: 0;
            color: #2c3e50;
            letter-spacing: 2px;
        }

        .company-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 30px;
            border-bottom: 1px solid #e5e7eb;
            flex-wrap: wrap;
        }

        .company-info h2 {
            font-size: 1.5rem;
            font-weight: bold;
            margin: 0 0 10px 0;
            color: #2c3e50;
        }

        .company-info p {
            margin: 3px 0;
            font-size: 0.95rem;
            color: #495057;
        }

        .logo img {
            width: 120px;
            max-width: 100%;
        }

        .bill-invoice-section {
            display: flex;
            justify-content: space-between;
            padding: 30px;
            border-bottom: 1px solid #e5e7eb;
            flex-wrap: wrap;
        }

        .bill-to h3 {
            font-size: 1.25rem;
            font-weight: bold;
            margin: 0 0 15px 0;
            color: #2c3e50;
        }

        .bill-to p {
            margin: 5px 0;
            font-size: 0.95rem;
            color: #495057;
        }

        .bill-to strong {
            color: #2c3e50;
        }

        .invoice-details {
            text-align: left;
        }

        .invoice-details table {
            margin-left: auto;
            border-collapse: collapse;
        }

        .invoice-details td {
            padding: 8px 15px;
            font-size: 0.95rem;
        }

        .invoice-details td:first-child {
            font-weight: bold;
            color: #2c3e50;
            text-align: right;
        }

        .invoice-details td:last-child {
            color: #495057;
        }

        .status-badge {
            background-color: #f05e252a;
            color: #F05E25;
            padding: 4px 12px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 0.85rem;
        }

        .items-header {
            padding: 20px 30px 10px 30px;
        }

        .items-header h3 {
            font-size: 1.25rem;
            font-weight: bold;
            margin: 0;
            color: #2c3e50;
        }

        .table-container {
            overflow-x: auto;
            padding: 0 30px;
        }

        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 0;
            min-width: 600px;
        }

        .items-table th {
            background-color: #f8f9fa;
            padding: 15px;
            text-align: left;
            font-weight: bold;
            color: #2c3e50;
            font-size: 0.9rem;
            text-transform: uppercase;
            border-bottom: 1px solid #dee2e6;
        }

        .items-table td {
            padding: 15px;
            border-bottom: 1px solid #e9ecef;
            color: #495057;
        }

        .items-table th:last-child,
        .items-table td:last-child {
            text-align: right;
        }

        .items-table th:nth-child(2),
        .items-table td:nth-child(2) {
            text-align: center;
        }

        .items-table th:nth-child(3),
        .items-table td:nth-child(3) {
            text-align: center;
        }

        .items-table th:nth-child(4),
        .items-table td:nth-child(4) {
            text-align: center;
        }

        .items-table th:nth-child(5),
        .items-table td:nth-child(5) {
            text-align: right;
        }

        .package-name {
            font-weight: bold;
            color: #2c3e50;
        }

        .package-dates {
            font-size: 0.85rem;
            color: #6c757d;
        }

        .summary-section {
            padding: 30px;
            background-color: #f8f9fa;
        }

        .summary-wrapper {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            flex-wrap: wrap;
        }

        .payment-summary h3 {
            font-size: 1.25rem;
            font-weight: bold;
            margin: 0 0 20px 0;
            color: #2c3e50;
        }

        .summary-table {
            min-width: 300px;
        }

        .summary-table tr td {
            padding: 8px 15px;
            font-size: 0.95rem;
        }

        .summary-table tr td:first-child {
            text-align: right;
            color: #495057;
        }

        .summary-table tr td:last-child {
            text-align: right;
            font-weight: bold;
            color: #2c3e50;
        }

        .total-row {
            border-top: 2px solid #dee2e6;
            font-size: 1.1rem !important;
        }

        .total-row td {
            padding-top: 15px !important;
            font-weight: bold !important;
            color: #F05E25 !important;
        }

        @media (max-width: 768px) {
            .invoice-header h1 {
                font-size: 2rem;
            }

            .company-section,
            .bill-invoice-section,
            .summary-wrapper {
                flex-direction: column;
                gap: 20px;
            }

            .logo {
                order: -1;
                text-align: center;
            }

            .invoice-details {
                text-align: left;
                width: 100%;
            }

            .invoice-details table {
                margin: 0;
                width: 100%;
            }

            .summary-table {
                margin: 0;
                width: 100%;
            }

            .table-container {
                padding: 0 15px;
            }

            .items-table th,
            .items-table td {
                padding: 12px 8px;
                font-size: 0.85rem;
            }
        }

        @media (max-width: 480px) {
            body {
                padding: 10px;
            }

            .invoice-header {
                padding: 20px;
            }

            .company-section,
            .bill-invoice-section,
            .summary-section {
                padding: 20px;
            }

            .invoice-header h1 {
                font-size: 1.75rem;
            }

            .company-info h2 {
                font-size: 1.25rem;
            }

            .bill-to h3,
            .items-header h3,
            .payment-summary h3 {
                font-size: 1.1rem;
            }

            .items-table th,
            .items-table td {
                padding: 10px 6px;
                font-size: 0.8rem;
            }

            .summary-table {
                min-width: 100%;
            }
        }
    </style>
</head>

<body>
    <div id="invoice-content">
        <!-- Header -->
        <div class="invoice-header">
            <h1>INVOICE</h1>
        </div>

        <!-- Bill To and Invoice Details -->
        <div class="bill-invoice-section">
            <div class="bill-to">
                <h3>Bill To</h3>
                <p><strong>Full Name:</strong> ${primaryContact.fullName}</p>
                <p><strong>Email:</strong> ${primaryContact.email}</p>
                <p><strong>Phone:</strong> ${
                  primaryContact.phoneNumber || "N/A"
                }</p>
                <p><strong>Country:</strong> ${primaryContact.country || ""}</p>
            </div>
            <div class="invoice-details">
                <table>
                    <tr>
                        <td>INVOICE NO:</td>
                        <td>${bookingReference}</td>
                    </tr>
                    <tr>
                        <td>Invoice Date:</td>
                        <td>${invoiceDate}</td>
                    </tr>
                    <tr>
                        <td>Due Date:</td>
                        <td>${dueDate}</td>
                    </tr>
                    <tr>
                        <td>Status:</td>
                        <td><span class="status-badge">${status}</span></td>
                    </tr>
                </table>
            </div>
        </div>

        <!-- Invoice Items Header -->
        <div class="items-header">
            <h3>Invoice Items</h3>
        </div>

        <!-- Items Table -->
        <div class="table-container">
            <table class="items-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Description</th>
                        <th>Travelers</th>
                        <th>Duration</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>1</td>
                        <td>
                            <div class="package-name">${packageName}</div>
                            <div class="package-dates">${startDate} – ${endDate}</div>
                        </td>
                        <td>${totalPeople}</td>
                        <td>${formatDuration(duration)}</td>
                        <td>${formatCurrency(basePricePerPerson)}</td>
                        <td>${formatCurrency(originalTotal)}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Payment Summary -->
        <div class="summary-section">
            <div class="summary-wrapper">
                <div class="payment-summary">
                    <h3>Payment Summary</h3>
                </div>
                <table class="summary-table">
                    <tr>
                        <td>Subtotal:</td>
                        <td><strong>${formatCurrency(
                          originalTotal
                        )}</strong></td>
                    </tr>
                    <tr>
                        <td>Discount (0%):</td>
                        <td><strong>-$0.00</strong></td>
                    </tr>
                    <tr>
                        <td>PAX Discount (${discountPercentage}%):</td>
                        <td><strong>-${formatCurrency(
                          discountAmount
                        )}</strong></td>
                    </tr>
                    <tr class="total-row">
                        <td>Total:</td>
                        <td><strong>${formatCurrency(totalAmount)}</strong></td>
                    </tr>
                </table>
            </div>
        </div>
    </div>
</body>

</html>`;
}
