namespace backend.Services;

public sealed class BusinessRuleException : Exception
{
    public int StatusCode { get; }
    public bool CheckoutNotCreated { get; }

    public BusinessRuleException(string message, int statusCode = 400, bool checkoutNotCreated = false)
        : base(message)
    {
        StatusCode = statusCode;
        CheckoutNotCreated = checkoutNotCreated;
    }
}
