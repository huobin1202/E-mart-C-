namespace backend.Services;

public sealed class BankTransferService(IConfiguration configuration)
{
    public bool Enabled => configuration.GetValue<bool>("BankTransfer:Enabled") &&
        !string.IsNullOrWhiteSpace(configuration["BankTransfer:BankCode"]) &&
        !string.IsNullOrWhiteSpace(configuration["BankTransfer:AccountNumber"]) &&
        !string.IsNullOrWhiteSpace(configuration["BankTransfer:AccountName"]);

    public object? Details => Enabled
        ? new
        {
            bankCode = configuration["BankTransfer:BankCode"],
            accountNumber = configuration["BankTransfer:AccountNumber"],
            accountName = configuration["BankTransfer:AccountName"]
        }
        : null;

    public string? QrUrl(decimal amount, string orderNumber) => !Enabled
        ? null
        : $"https://img.vietqr.io/image/{Uri.EscapeDataString(configuration["BankTransfer:BankCode"]!)}-" +
          $"{Uri.EscapeDataString(configuration["BankTransfer:AccountNumber"]!)}-compact2.png?" +
          $"amount={amount:0}&addInfo={Uri.EscapeDataString("EMART_" + orderNumber)}&" +
          $"accountName={Uri.EscapeDataString(configuration["BankTransfer:AccountName"]!)}";
}
