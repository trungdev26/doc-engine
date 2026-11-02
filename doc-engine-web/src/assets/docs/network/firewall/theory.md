# Firewall và Network Access Control

Firewall là lớp kiểm soát traffic được phép đi vào hoặc đi ra khỏi một máy/network. Khi một service "đã chạy rồi nhưng máy khác không gọi được", ngoài code, port và DNS, phải nghĩ đến network access control.

Firewall thường quyết định dựa trên các thông tin:

```text
Source IP
Source port
Destination IP
Destination port
Protocol: TCP/UDP/ICMP
Direction: inbound/outbound
Network profile: Domain/Private/Public
Program/process nếu firewall rule theo application
```

Trong thực tế, "firewall" không chỉ là Windows Firewall trên một máy. Nó có thể nằm ở nhiều tầng:

| Tầng | Ví dụ | Chặn cái gì? |
|---|---|---|
| Host firewall | Windows Firewall, Linux `ufw`/`iptables` | Traffic vào/ra một máy cụ thể |
| Network firewall | Firewall công ty, router, VPN policy | Traffic giữa các subnet, site, văn phòng, VPN |
| Cloud firewall | AWS Security Group/NACL, Azure NSG, GCP firewall rule | Traffic vào/ra VM, subnet, load balancer |
| Container/Kubernetes | NetworkPolicy, service mesh policy | Pod/service nào được gọi pod/service nào |
| Application edge | Reverse proxy, API gateway, WAF | HTTP route, method, header, IP, rate limit, attack pattern |

Vì vậy khi một kết nối fail, câu hỏi đúng không chỉ là "mở firewall chưa?", mà là:

```text
Traffic đi qua những hop nào?
Mỗi hop có rule allow/deny gì?
Rule đang áp dụng theo IP, port, protocol, profile, subnet hay identity?
```

---

## 1. Inbound và outbound

| Direction | Nghĩa là gì | Ví dụ |
|---|---|---|
| Inbound | Traffic từ máy khác đi vào máy mình | Máy khác gọi service trên máy mình qua `10.0.1.20:5000` |
| Outbound | Traffic từ máy mình đi ra máy khác | Service trên máy mình gọi API ngoài, database, Redis, payment gateway |

Khi expose một service local cho máy khác gọi, thường cần kiểm tra **inbound rule** trên máy đang chạy service. Khi service gọi ra ngoài nhưng bị chặn, kiểm tra **outbound rule** trên máy chạy service hoặc firewall/network policy ở tầng công ty/cloud.

Ví dụ:

```text
Máy A: chạy service tại 10.0.1.20:5000
Máy B: gọi http://10.0.1.20:5000/api/status
```

Nếu Máy B gọi không được, checklist nên đi theo thứ tự:

1. Service có thật sự đang listen port `5000` không?
2. Service listen trên `127.0.0.1` hay trên `0.0.0.0`/IP LAN?
3. Máy B có route/ping tới Máy A không?
4. Firewall trên Máy A có inbound allow TCP `5000` không?
5. Rule có đúng network profile/subnet đang dùng không?
6. Có firewall/router/VPN/company policy nào ở giữa chặn không?

---

## 2. Allow theo port, program hoặc source IP

| Cách rule | Khi nào dùng | Lưu ý |
|---|---|---|
| Allow port | Service cố định port, dễ test bằng TCP | Mở port rộng quá có thể tăng surface attack |
| Allow program | Muốn chỉ cho một executable cụ thể nhận traffic | Khi đổi path/version executable có thể phải cập nhật rule |
| Allow source IP | Chỉ cho một số máy/subnet gọi vào | Nên dùng khi chỉ client nội bộ cần truy cập |

Ví dụ nên mở hẹp:

```text
Allow inbound TCP 5000
Remote IP: 10.0.1.0/24
Profile: Domain/Private
Program: path tới service nếu cần
```

Tránh kiểu:

```text
Allow inbound any port from any IP trên Public network
```

Rule tốt là rule trả lời rõ:

```text
Cho ai gọi?
Gọi vào IP/port nào?
Dùng protocol gì?
Áp dụng profile/subnet nào?
Có cần giới hạn theo executable không?
Khi không dùng nữa ai chịu trách nhiệm gỡ rule?
```

---

## 3. IP allowlist, denylist và CIDR

Nhiều hệ thống không chỉ mở port, mà còn giới hạn **IP nào được phép gọi**.

| Khái niệm | Nghĩa là gì | Ví dụ |
|---|---|---|
| Allowlist | Chỉ IP/subnet trong danh sách được truy cập | Chỉ `10.0.1.0/24` được gọi API nội bộ |
| Denylist | Chặn IP/subnet trong danh sách | Chặn một IP đang spam request |
| CIDR | Cách viết một dải IP | `10.0.1.0/24`, `192.168.0.0/16` |
| Public IP | IP nhìn thấy từ Internet | IP NAT gateway, IP văn phòng, IP server public |
| Private IP | IP trong mạng nội bộ/VPC/LAN | `10.x.x.x`, `172.16.x.x`, `192.168.x.x` |

Ví dụ `10.0.1.0/24` nghĩa là dải:

```text
10.0.1.0 -> 10.0.1.255
```

Khi bên thứ ba yêu cầu "gửi IP để whitelist", cần làm rõ họ cần IP nào:

```text
IP public outbound của server?
IP public của NAT gateway?
IP văn phòng/VPN?
IP private trong cùng VPC?
IPv4 hay IPv6?
```

Sai lầm hay gặp là gửi private IP `192.168.x.x` cho một hệ thống ngoài Internet. Private IP chỉ có nghĩa trong mạng nội bộ của mình; bên ngoài thường cần public outbound IP.

---

## 4. Bind address, localhost và expose service

Firewall mở port chưa đủ. Service còn phải listen trên đúng network interface.

| Bind address | Ý nghĩa |
|---|---|
| `127.0.0.1` / `localhost` | Chỉ máy local gọi được |
| `0.0.0.0` | Listen trên mọi IPv4 interface |
| IP LAN cụ thể, ví dụ `10.0.1.20` | Chỉ listen trên interface/IP đó |

Case rất thường gặp:

```text
curl http://localhost:5000 chạy được trên server.
Máy khác gọi http://10.0.1.20:5000 không được.
```

Có thể không phải firewall, mà service chỉ bind `127.0.0.1`. Khi cần máy khác gọi, kiểm tra config listen URL/bind address của app hoặc service.

---

## 5. NAT, port forwarding và IP nhìn từ bên ngoài

NAT làm IP/port thay đổi khi traffic đi qua router/gateway.

Ví dụ outbound:

```text
Server private: 10.0.1.20
Ra Internet qua NAT gateway public IP: 203.0.113.10
Provider thấy request đến từ: 203.0.113.10
```

Vì vậy nếu provider cần whitelist IP, thường whitelist `203.0.113.10`, không phải `10.0.1.20`.

Ví dụ inbound qua port forwarding:

```text
Client ngoài Internet -> Public IP router:8443 -> forward vào 192.168.1.20:443
```

Trong production, nên ưu tiên load balancer/API gateway/VPN/private link hơn là mở port thẳng vào server nếu hệ thống có lựa chọn tốt hơn.

---

## 6. Proxy, VPN, WAF và gateway cũng có thể chặn

Không phải mọi lỗi network access đều nằm ở firewall máy local.

| Thành phần | Có thể gây lỗi gì |
|---|---|
| Corporate proxy | Service không ra Internet được nếu chưa config proxy |
| VPN | Chỉ vào được subnet nội bộ khi đang kết nối VPN |
| API gateway | Chặn route/method/header/token/IP |
| WAF | Chặn request vì pattern giống attack hoặc body quá lớn |
| Load balancer | Health check fail, target không nhận traffic |
| Kubernetes ingress | Rule host/path/service sai |

Nếu TCP connect được nhưng HTTP bị `403`, vấn đề thường đã qua tầng TCP/firewall và nằm ở auth, gateway, WAF hoặc application policy.

---

## 7. Lệnh Windows thường dùng

Kiểm tra service có listen port không:

```powershell
netstat -ano | findstr :5000
```

Test từ máy client:

```powershell
Test-NetConnection 10.0.1.20 -Port 5000
```

Tạo inbound rule theo port:

```powershell
New-NetFirewallRule `
  -DisplayName "Allow MyService TCP 5000" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 5000 `
  -RemoteAddress 10.0.1.0/24 `
  -Action Allow `
  -Profile Domain,Private
```

Xem rule:

```powershell
Get-NetFirewallRule -DisplayName "Allow MyService TCP 5000"
```

Xóa rule khi không còn dùng:

```powershell
Remove-NetFirewallRule -DisplayName "Allow MyService TCP 5000"
```

Một số lệnh khác hữu ích:

```powershell
Get-NetTCPConnection -LocalPort 5000
```

```powershell
Get-NetFirewallProfile
```

```powershell
Get-NetIPAddress
```

---

## 8. Tư duy debug access bị chặn

Firewall issue thường có biểu hiện giống network timeout:

```text
Connection timeout
No route / unreachable
Client chờ lâu rồi fail
Máy local gọi localhost được, máy khác gọi IP LAN không được
```

Nhưng cần phân biệt:

| Hiện tượng | Có thể là |
|---|---|
| `localhost:5000` chạy, `10.0.1.20:5000` trên cùng máy không chạy | Service chỉ bind localhost hoặc firewall/profile |
| Trên máy server gọi IP LAN được, máy khác không gọi được | Firewall inbound hoặc network ở giữa |
| TCP connect được nhưng HTTP trả 401/403/500 | Đã qua firewall, lỗi nằm ở application/security |
| Ping fail nhưng TCP port vẫn connect được | ICMP bị chặn, không kết luận service chết |

Checklist tổng quát khi nghi access bị chặn:

1. Xác định chính xác client IP, server IP, protocol và port.
2. Kiểm tra service có listen đúng port/interface không.
3. Test từ chính server bằng `localhost`, rồi bằng IP LAN/public tương ứng.
4. Test từ client bằng `Test-NetConnection`, `curl`, `telnet` hoặc `nc`.
5. Kiểm tra host firewall inbound trên server.
6. Kiểm tra host firewall outbound trên client/server nếu gọi ra ngoài.
7. Kiểm tra router/VPN/subnet/cloud security group/load balancer ở giữa.
8. Nếu TCP connect được, chuyển hướng debug lên HTTP/TLS/auth/gateway/WAF/application.
9. Ghi lại rule đã mở: ai yêu cầu, mở cho IP nào, port nào, lý do gì, khi nào review/gỡ.

Firewall không chỉ là việc "mở port cho chạy". Nó là một phần của security boundary. Mở càng hẹp càng tốt: đúng port, đúng source IP/subnet, đúng profile, đúng service.
