using Microsoft.AspNetCore.SignalR;

namespace backend.Hubs
{
    public class OrderHub : Hub
    {
        // Hub hỗ trợ kết nối realtime từ POS web và Mobile app
        public async Task JoinGroup(string groupName)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        }

        public async Task LeaveGroup(string groupName)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
        }
    }
}
