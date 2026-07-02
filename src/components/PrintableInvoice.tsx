import type { Invoice, Company } from "@/types";
import { fmtMoney, fmtDate } from "@/lib/format";

interface Props {
  inv: Invoice;
  company: Company;
  mode: "sale" | "purchase";
}

// Number to words (Indian) - simple version
function numToWords(n: number): string {
  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const inWords = (num: number): string => {
    if (num < 20) return a[num];
    if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? " " + a[num % 10] : "");
    if (num < 1000)
      return a[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + inWords(num % 100) : "");
    if (num < 100000)
      return (
        inWords(Math.floor(num / 1000)) +
        " Thousand" +
        (num % 1000 ? " " + inWords(num % 1000) : "")
      );
    if (num < 10000000)
      return (
        inWords(Math.floor(num / 100000)) +
        " Lakh" +
        (num % 100000 ? " " + inWords(num % 100000) : "")
      );
    return (
      inWords(Math.floor(num / 10000000)) +
      " Crore" +
      (num % 10000000 ? " " + inWords(num % 10000000) : "")
    );
  };
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  let s = inWords(rupees) + " Rupees";
  if (paise) s += " and " + inWords(paise) + " Paise";
  return s + " Only";
}

export function PrintableInvoice({ inv, company, mode }: Props) {
  const gstOn = inv.gstEnabled !== false;
  const isSale = mode === "sale";
  const title = gstOn ? "TAX INVOICE" : isSale ? "INVOICE / BILL OF SUPPLY" : "PURCHASE BILL";

  // Aggregate GST by rate for summary
  const gstBuckets: Record<string, { taxable: number; tax: number }> = {};
  let taxableTotal = 0;
  inv.lineItems.forEach((l) => {
    const taxable = l.qty * l.price * (1 - l.discountPct / 100);
    taxableTotal += taxable;
    if (gstOn) {
      const key = l.gstRate.toString();
      if (!gstBuckets[key]) gstBuckets[key] = { taxable: 0, tax: 0 };
      gstBuckets[key].taxable += taxable;
      gstBuckets[key].tax += taxable * (l.gstRate / 100);
    }
  });

  const totalQty = inv.lineItems.reduce((s, l) => s + l.qty, 0);

  const cellStyle: React.CSSProperties = {
    border: "1px solid #000",
    padding: "6px 8px",
    fontSize: 11,
  };
  const th: React.CSSProperties = {
    ...cellStyle,
    background: "#f0f0f0",
    fontWeight: 700,
    textAlign: "left",
  };

  return (
    <div className="print-area" style={{ fontFamily: "Arial, sans-serif", color: "#000" }}>
      {/* Header */}
      <div
        style={{
          textAlign: "center",
          borderBottom: "2px solid #000",
          paddingBottom: 8,
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>
          {company.name || "Your Company"}
        </div>
        {company.address && <div style={{ fontSize: 11 }}>{company.address}</div>}
        <div style={{ fontSize: 11 }}>
          {company.phone && <>Phone: {company.phone}</>}
          {company.phone && company.email && " · "}
          {company.email && <>Email: {company.email}</>}
        </div>
        {gstOn && company.gstin && (
          <div style={{ fontSize: 11, fontWeight: 600 }}>GSTIN: {company.gstin}</div>
        )}
      </div>

      {/* Party + Invoice meta */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
        <tbody>
          <tr>
            <td style={{ ...cellStyle, width: "60%", verticalAlign: "top" }}>
              <div style={{ fontSize: 10, color: "#555", fontWeight: 600, marginBottom: 3 }}>
                {isSale ? "BILL TO" : "SUPPLIER"}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{inv.partyName || "—"}</div>
              {inv.partyPhone && <div>Phone: {inv.partyPhone}</div>}
            </td>
            <td style={{ ...cellStyle, verticalAlign: "top" }}>
              <table style={{ width: "100%", fontSize: 11 }}>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600, paddingRight: 6 }}>Invoice #:</td>
                    <td>{inv.number}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Date:</td>
                    <td>{fmtDate(inv.date)}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Payment:</td>
                    <td style={{ textTransform: "capitalize" }}>{inv.paymentMode}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Line items */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 28, textAlign: "center" }}>#</th>
            <th style={th}>Item</th>
            <th style={{ ...th, textAlign: "right", width: 55 }}>Qty</th>
            <th style={{ ...th, width: 45 }}>Unit</th>
            <th style={{ ...th, textAlign: "right", width: 75 }}>Price</th>
            <th style={{ ...th, textAlign: "right", width: 55 }}>Disc%</th>
            {gstOn && <th style={{ ...th, textAlign: "right", width: 55 }}>GST%</th>}
            {gstOn && <th style={{ ...th, textAlign: "right", width: 75 }}>GST Amt</th>}
            <th style={{ ...th, textAlign: "right", width: 90 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.lineItems.map((l, i) => {
            const taxable = l.qty * l.price * (1 - l.discountPct / 100);
            const gstAmt = gstOn ? taxable * (l.gstRate / 100) : 0;
            return (
              <tr key={l.id}>
                <td style={{ ...cellStyle, textAlign: "center" }}>{i + 1}</td>
                <td style={cellStyle}>{l.name}</td>
                <td style={{ ...cellStyle, textAlign: "right" }}>{l.qty}</td>
                <td style={cellStyle}>{l.unit}</td>
                <td style={{ ...cellStyle, textAlign: "right" }}>{fmtMoney(l.price)}</td>
                <td style={{ ...cellStyle, textAlign: "right" }}>{l.discountPct}%</td>
                {gstOn && <td style={{ ...cellStyle, textAlign: "right" }}>{l.gstRate}%</td>}
                {gstOn && <td style={{ ...cellStyle, textAlign: "right" }}>{fmtMoney(gstAmt)}</td>}
                <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600 }}>
                  {fmtMoney(taxable + gstAmt)}
                </td>
              </tr>
            );
          })}
          {/* filler */}
          {inv.lineItems.length < 6 &&
            Array.from({ length: 6 - inv.lineItems.length }).map((_, i) => (
              <tr key={"e" + i}>
                <td style={{ ...cellStyle, height: 20 }}>&nbsp;</td>
                <td style={cellStyle}></td>
                <td style={cellStyle}></td>
                <td style={cellStyle}></td>
                <td style={cellStyle}></td>
                <td style={cellStyle}></td>
                {gstOn && <td style={cellStyle}></td>}
                {gstOn && <td style={cellStyle}></td>}
                <td style={cellStyle}></td>
              </tr>
            ))}
          <tr>
            <td style={{ ...cellStyle, fontWeight: 700 }} colSpan={2}>
              Total
            </td>
            <td style={{ ...cellStyle, textAlign: "right", fontWeight: 700 }}>{totalQty}</td>
            <td style={cellStyle} colSpan={gstOn ? 4 : 2}></td>
            {gstOn && (
              <td style={{ ...cellStyle, textAlign: "right", fontWeight: 700 }}>
                {fmtMoney(inv.taxAmount)}
              </td>
            )}
            <td style={{ ...cellStyle, textAlign: "right", fontWeight: 700 }}>
              {fmtMoney(inv.subtotal + inv.taxAmount)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Totals + tax summary */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
        <tbody>
          <tr>
            <td style={{ ...cellStyle, width: "58%", verticalAlign: "top" }}>
              <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>Amount in Words</div>
              <div style={{ fontSize: 11, fontStyle: "italic" }}>{numToWords(inv.total)}</div>
              {inv.notes && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, marginTop: 8, marginBottom: 3 }}>
                    Notes
                  </div>
                  <div style={{ fontSize: 11 }}>{inv.notes}</div>
                </>
              )}
              {gstOn && Object.keys(gstBuckets).length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 3 }}>Tax Summary</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead>
                      <tr>
                        <th style={th}>GST %</th>
                        <th style={{ ...th, textAlign: "right" }}>Taxable</th>
                        <th style={{ ...th, textAlign: "right" }}>CGST</th>
                        <th style={{ ...th, textAlign: "right" }}>SGST</th>
                        <th style={{ ...th, textAlign: "right" }}>Total Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(gstBuckets).map(([rate, v]) => (
                        <tr key={rate}>
                          <td style={cellStyle}>{rate}%</td>
                          <td style={{ ...cellStyle, textAlign: "right" }}>
                            {fmtMoney(v.taxable)}
                          </td>
                          <td style={{ ...cellStyle, textAlign: "right" }}>
                            {fmtMoney(v.tax / 2)}
                          </td>
                          <td style={{ ...cellStyle, textAlign: "right" }}>
                            {fmtMoney(v.tax / 2)}
                          </td>
                          <td style={{ ...cellStyle, textAlign: "right" }}>{fmtMoney(v.tax)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </td>
            <td style={{ ...cellStyle, verticalAlign: "top", padding: 0 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <tbody>
                  <tr>
                    <td style={{ padding: "5px 8px" }}>Subtotal</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>
                      {fmtMoney(taxableTotal)}
                    </td>
                  </tr>
                  {inv.discount > 0 && (
                    <tr>
                      <td style={{ padding: "5px 8px" }}>Discount</td>
                      <td style={{ padding: "5px 8px", textAlign: "right" }}>
                        - {fmtMoney(inv.discount)}
                      </td>
                    </tr>
                  )}
                  {gstOn && (
                    <tr>
                      <td style={{ padding: "5px 8px" }}>Total GST</td>
                      <td style={{ padding: "5px 8px", textAlign: "right" }}>
                        {fmtMoney(inv.taxAmount)}
                      </td>
                    </tr>
                  )}
                  {!!inv.roundOff && Math.abs(inv.roundOff) > 0.001 && (
                    <tr>
                      <td style={{ padding: "5px 8px" }}>Round Off</td>
                      <td style={{ padding: "5px 8px", textAlign: "right" }}>
                        {inv.roundOff > 0 ? "+" : "−"} {fmtMoney(Math.abs(inv.roundOff))}
                      </td>
                    </tr>
                  )}
                  <tr style={{ background: "#f0f0f0", fontWeight: 800, fontSize: 14 }}>
                    <td style={{ padding: "8px", borderTop: "2px solid #000" }}>Grand Total</td>
                    <td style={{ padding: "8px", textAlign: "right", borderTop: "2px solid #000" }}>
                      {fmtMoney(inv.total)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "5px 8px" }}>Paid</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{fmtMoney(inv.paid)}</td>
                  </tr>
                  <tr style={{ fontWeight: 700 }}>
                    <td style={{ padding: "5px 8px", borderTop: "1px solid #000" }}>
                      Balance {inv.total - inv.paid > 0 ? "Due" : "Paid"}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        textAlign: "right",
                        borderTop: "1px solid #000",
                      }}
                    >
                      {fmtMoney(Math.abs(inv.total - inv.paid))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20 }}>
        <tbody>
          <tr>
            <td style={{ width: "50%", fontSize: 10, verticalAlign: "top", paddingRight: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Terms &amp; Conditions</div>
              <div>1. Goods once sold will not be taken back.</div>
              <div>2. Interest @18% p.a. will be charged on delayed payments.</div>
              <div>3. Subject to local jurisdiction.</div>
            </td>
            <td
              style={{ width: "50%", textAlign: "right", verticalAlign: "bottom", paddingTop: 40 }}
            >
              <div
                style={{
                  borderTop: "1px solid #000",
                  display: "inline-block",
                  paddingTop: 4,
                  minWidth: 200,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                For {company.name || "Company"}
                <br />
                <span style={{ fontWeight: 400, fontSize: 10 }}>Authorised Signatory</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ textAlign: "center", marginTop: 12, fontSize: 10, color: "#555" }}>
        This is a computer-generated invoice.
      </div>
    </div>
  );
}
