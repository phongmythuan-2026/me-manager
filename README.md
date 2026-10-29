# me-manager

## Quy trình yêu cầu và sửa chữa

- Yêu cầu mới bắt đầu ở trạng thái `Chờ tiếp nhận`; Admin/Kỹ thuật tiếp nhận để chuyển sang `Đã tiếp nhận`.
- Admin/Kỹ thuật tạo nhật ký trong `YEU_CAU_TH`; khi lưu, nhật ký được đặt trạng thái `Đã thực hiện`. Yêu cầu chuyển sang `Đang thực hiện` khi còn nhật ký chưa hoàn tất và sang `Đã thực hiện` khi mọi nhật ký liên kết đã hoàn tất.
- Admin/Kỹ thuật dùng thao tác `Đã thực hiện` trên yêu cầu để chuyển sang `Chờ xác nhận`; người yêu cầu hoặc Admin xác nhận để chuyển sang `Hoàn thành`.
- Mã yêu cầu trong nhật ký sửa chữa tham chiếu ID của `YEU_CAU` và không bắt buộc.
- Vật tư sử dụng là các dòng xuất trong `KHO`; cột `Mã yêu cầu` của sổ kho tham chiếu `ID TH` của nhật ký sửa chữa.
- Chi tiết yêu cầu hiển thị thông tin master cùng lịch sử nhật ký sửa chữa theo mã yêu cầu và lịch sử vật tư theo ID TH của các nhật ký liên kết.
- Form tạo/sửa yêu cầu hiển thị loại yêu cầu, khu vực và máy móc trên một hàng ba cột; mô tả chiếm toàn hàng, ngày hoàn thành và tệp đính kèm nằm cạnh nhau.
- Chi tiết yêu cầu sắp xếp thông tin thành ba cột, giữ mô tả riêng và hai tab lịch sử sửa chữa, lịch sử sử dụng vật tư.
- Form MMTB dùng bố cục bốn cột trên màn hình rộng, tự thu về hai cột trên màn hình vừa và một cột trên màn hình nhỏ; các trường ghi chú tình trạng và thông số kỹ thuật vẫn được giữ.
- Các ô chọn dữ liệu tham chiếu trong form có nút **+** để tạo nhanh bản ghi liên quan; nút chỉ hiển thị khi người dùng có quyền tạo. Sau khi tạo, dữ liệu mới được đồng bộ và chọn vào form hiện tại, đồng thời giữ các lựa chọn khác đang nhập.
- Dashboard tính nhóm đang xử lý gồm các phiếu đã tiếp nhận, đang thực hiện, đã thực hiện và chờ xác nhận; chỉ phiếu ở trạng thái `Hoàn thành` được tính hoàn thành. Lịch Dashboard hiển thị cả phiếu yêu cầu và nhật ký sửa chữa theo đúng thời gian bắt đầu/kết thúc.
- Hai bảng lịch sử sửa chữa và vật tư trong chi tiết yêu cầu có menu ba chấm theo từng dòng; form xem nhật ký sửa chữa hiển thị các thao tác sao chép, sửa và xóa cho Admin/Kỹ thuật.
- Tab vật tư thay thế trong form chi tiết máy móc cũng có menu ba chấm theo từng dòng; thao tác sửa/xóa chỉ dành cho Admin.
- Bảng theo dõi vật tư thay thế lấy ngày thay gần nhất từ giao dịch xuất kho âm khớp mã vật tư và mã máy, sau đó cộng giờ thực hiện trong báo cáo sản xuất từ ngày thay đến hiện tại. Tỷ lệ giờ đã chạy so với tần suất dưới 90% hiển thị “Chuẩn bị thay thế phụ tùng”, trên 100% hiển thị “Đã quá hạn thay thế”; bảng tải lại báo cáo khi mở tab hoặc bấm cập nhật giờ chạy.
- Danh mục vật tư có mục xem trong menu ba chấm; form xem vật tư cung cấp thao tác sửa/xóa cho Admin và được mở thống nhất từ các liên kết vật tư.
- Báo cáo tồn kho hiển thị menu ba chấm cho từng dòng để mở xem vật tư và thao tác sửa/xóa theo quyền; danh mục vật tư cũng luôn có nút menu để người dùng không có quyền quản lý vẫn truy cập chức năng xem.
- Form nhật ký sửa chữa bố trí các trường theo lưới ba cột, cuộn phần nội dung theo chiều cao trình duyệt và giữ nút lưu/đóng luôn hiển thị; khi tạo từ một yêu cầu, loại công việc, máy móc và mã yêu cầu được kế thừa từ phiếu liên kết.
- Trong nhật ký sửa chữa, nhân viên nhập số lượng vật tư là số dương; hệ thống tự ghi số âm tương ứng vào sổ kho để thể hiện xuất dùng.
- Quá trình lưu nhật ký tải các tệp đính kèm đồng thời tối đa ba tệp và ghi các dòng vật tư mới vào kho theo lô để giảm thời gian chờ.
- Thao tác nhanh ngoài bảng dùng nút chức năng trực tiếp; thao tác trên dòng trong bảng dùng menu ba chấm hoặc nhấp chuột phải.
- Thanh tiêu đề của mỗi màn hình có nút **Đồng bộ** để tải lại dữ liệu từ Google Sheets; màn hình Dashboard và Báo cáo sản xuất cũng tải lại dữ liệu SharePoint tương ứng.
- Các cửa sổ đang đăng nhập kiểm tra phiên bản dữ liệu Google Sheets mỗi 15 giây và chỉ tải lại toàn bộ dữ liệu khi phiên bản thay đổi. Nếu một biểu mẫu đang mở, việc tự tải lại được hoãn đến khi đóng biểu mẫu để tránh mất nội dung chưa lưu. Khi quay lại cửa sổ đang chạy nền, ứng dụng kiểm tra thay đổi ngay.
- Đồng bộ giữa người dùng là gần thời gian thực qua kiểm tra phiên bản định kỳ Google Sheets (độ trễ thông thường tối đa khoảng 15 giây), không phải kết nối push tức thời. Báo cáo sản xuất SharePoint được dùng lại trong trình duyệt trong 60 giây để tránh gọi lại cùng một lần đọc Excel giữa Dashboard và màn hình báo cáo; nút **Làm mới dữ liệu** hoặc **Đồng bộ** trên báo cáo sẽ yêu cầu dữ liệu mới. Thay đổi riêng trên SharePoint không được phiên bản Google Sheets phát hiện tự động.
- Các trường tham chiếu tới yêu cầu, nhật ký sửa chữa, máy móc, vật tư, loại yêu cầu, khu vực và người dùng trong bảng nghiệp vụ được hiển thị bằng chữ xanh để nhận biết liên kết; bấm vào sẽ mở chi tiết bản ghi liên quan. Liên kết chỉ xuất hiện khi tìm thấy bản ghi đích và không gạch chân.
- Bảng Quản lý Yêu cầu không mở chi tiết khi bấm vào dòng; các liên kết Khu vực và Máy móc/Thiết bị mở form chi tiết bản ghi tương ứng. Form Khu vực có nút sửa/xóa cho Admin; form MMTB hiển thị nút sao chép/sửa/xóa theo quyền quản lý. Trong chi tiết yêu cầu, các thao tác được hiển thị ngay trên form theo trạng thái và quyền người dùng; phần thông tin dùng lưới bốn cột, giữ nguyên mô tả và hai tab lịch sử.
- Bảng danh mục máy móc thiết bị tự xác định độ rộng cột theo tiêu đề và nội dung dữ liệu, giới hạn độ rộng tối đa để tránh cột quá dài; nội dung hoặc tiêu đề vượt giới hạn được rút gọn bằng dấu ba chấm và xem đầy đủ qua tooltip.

Danh mục `DMVT` dùng các cột `Mã vật tư`, `Tên vật tư`, `Đvt`, `Người tạo`, `Ngày tạo`. Mã vật tư là số tự tăng; mã trong `KHO` được lưu dạng số và tham chiếu tới danh mục này. Form danh mục chỉ nhập tên và đơn vị tính; người tạo, ngày tạo và mã được hệ thống cấp.

Menu `Quản lý Yêu cầu` có tab `Loại yêu cầu`; menu `Máy móc thiết bị` có tab `Khu vực`. Các bảng Khu vực, Loại yêu cầu, Nhân viên và Vật tư thay thế hỗ trợ tìm kiếm, sắp xếp, ghim cột, tiêu đề cố định, cuộn trong vùng bảng và phân trang; thao tác xem/sửa/xóa tiếp tục tuân theo quyền người dùng. Form thêm/sửa Khu vực sử dụng modal Bootstrap và có thể mở chồng lên các form khác. Danh mục máy móc thiết bị có bộ lọc mã/tên và khu vực được đặt cùng hàng trên màn hình rộng, có tiêu đề hướng dẫn rõ ràng. Các biểu mẫu tạo tham chiếu mở từ nút thêm sẽ hiển thị phía trên biểu mẫu hiện tại. Báo cáo tồn kho mặc định hiển thị kỳ 30 ngày trước đến ngày hiện tại, có thể lọc theo mã hoặc tên vật tư. Trường `Phụ tùng / việc bảo trì` của khai báo vật tư thay thế tự lấy tên từ danh mục vật tư và không cho nhập ghi chú thủ công. Các trường đơn vị trong DMVT, MMTB và vật tư thay thế gợi ý đơn vị đã dùng nhưng vẫn cho nhập giá trị mới.

Sổ `KHO` lưu thêm mã máy móc/thiết bị và giá trị xuất/nhập (số lượng × đơn giá) bên cạnh các cột: `ID KHO`, `Ngày nhập xuất`, `Mã vật tư`, `Số lượng`, `Đơn giá`, `Ghi chú`, `Người thực hiện`, `Ngày thực hiện`, `Mã yêu cầu`. Sổ chỉ có một cột `Ghi chú`. Trên bảng và file Excel, hai cột thiết bị và giá trị hiển thị lần lượt là `Máy móc/TB` và `Giá trị`; máy móc được lấy theo `ID TH` trong `YEU_CAU_TH` khi có liên kết nhật ký sửa chữa. Admin và Kỹ thuật được phép thêm, sửa, xóa danh mục vật tư và giao dịch kho; dòng xuất vật tư được tạo tự động từ nhật ký phải được cập nhật thông qua nhật ký sửa chữa.

Số lượng dương là nhập kho; số lượng âm là xuất kho.