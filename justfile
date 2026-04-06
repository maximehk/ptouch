list:
  just -l

serve:
  node server.js

printers:
    uvx --with pyusb python -c "\
        import usb.core; \
        [print(hex(d.idProduct), d) for d in usb.core.find(find_all=True, idVendor=0x04f9)]"
