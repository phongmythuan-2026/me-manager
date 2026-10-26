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
- Form nhật ký sửa chữa bố trí các trường theo lưới ba cột, cuộn phần nội dung theo chiều cao trình duyệt và giữ nút lưu/đóng luôn hiển thị; khi tạo từ một yêu cầu, loại công việc, máy móc và mã yêu cầu được kế thừa từ phiếu liên kết.
- Trong nhật ký sửa chữa, nhân viên nhập số lượng vật tư là số dương; hệ thống tự ghi số âm tương ứng vào sổ kho để thể hiện xuất dùng.
- Quá trình lưu nhật ký tải các tệp đính kèm đồng thời tối đa ba tệp và ghi các dòng vật tư mới vào kho theo lô để giảm thời gian chờ.
- Thao tác nhanh ngoài bảng dùng nút chức năng trực tiếp; thao tác trên dòng trong bảng dùng menu ba chấm hoặc nhấp chuột phải.

Sổ `KHO` có các cột: `ID KHO`, `Ngày nhập xuất`, `Mã vật tư`, `Số lượng`, `Đơn giá`, `Ghi chú`, `Người thực hiện`, `Ngày thực hiện`, `Mã yêu cầu`.

Số lượng dương là nhập kho; số lượng âm là xuất kho.