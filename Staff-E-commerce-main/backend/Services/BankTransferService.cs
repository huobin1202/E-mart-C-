namespace backend.Services;

public sealed class BankTransferService(IConfiguration config)
{
    public bool Enabled => config.GetValue<bool>("BankTransfer:Enabled") &&
        !string.IsNullOrWhiteSpace(config["BankTransfer:BankCode"]) &&
        !string.IsNullOrWhiteSpace(config["BankTransfer:AccountNumber"]) &&
        !string.IsNullOrWhiteSpace(config["BankTransfer:AccountName"]);

    public object? Details => Enabled ? new { bankCode = config["BankTransfer:BankCode"],
        accountNumber = config["BankTransfer:AccountNumber"], accountName = config["BankTransfer:AccountName"] } : null;

    public string? QrUrl(decimal amount, string orderNumber) => !Enabled ? null :
        $"https://img.vietqr.io/image/{Uri.EscapeDataString(config["BankTransfer:BankCode"]!)}-{Uri.EscapeDataString(config["BankTransfer:AccountNumber"]!)}-compact2.png?amount={amount:0}&addInfo={Uri.EscapeDataString("EMART_" + orderNumber)}&accountName={Uri.EscapeDataString(config["BankTransfer:AccountName"]!)}";
}
